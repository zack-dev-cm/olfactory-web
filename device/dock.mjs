export class SimulatedDock {
  mode = 'simulation'
  status = 'ready'
  current = null

  get ready() { return this.status === 'ready' }

  deliver(_id, _condition, phase) {
    this.status = 'busy'
    this.current = { phase, timer: setTimeout(() => this.stop('purged'), 650) }
    phase('acknowledged')
  }

  stop(phase) {
    const current = this.current
    if (!current) return
    clearTimeout(current.timer)
    this.current = null
    this.status = 'ready'
    current.phase(phase)
  }

  mute() { this.stop('stopped') }
  close() { this.mute() }
}

export class UsbDock {
  mode = 'usb'
  status = 'connecting'
  port = null
  current = null
  retry = null
  closed = false

  constructor(path, SerialPort, ReadlineParser) {
    this.path = path
    this.SerialPort = SerialPort
    this.ReadlineParser = ReadlineParser
    this.connect()
    this.poll = setInterval(() => this.write('PING'), 400)
  }

  get ready() { return this.status === 'ready' && !this.current }

  connect() {
    const port = new this.SerialPort({ path: this.path, baudRate: 115200, autoOpen: false })
    this.port = port
    this.status = 'connecting'
    const lost = () => this.disconnect(port)
    port.on('error', lost)
    port.on('close', lost)
    const parser = port.pipe(new this.ReadlineParser({ delimiter: '\n' }))
    parser.on('data', (line) => {
      if (this.port === port) this.receive(line.trim())
    })
    port.open((error) => error ? lost() : this.write('PING'))
  }

  disconnect(port) {
    if (this.port !== port) return
    this.port = null
    this.status = 'offline'
    if (port.isOpen) port.close(() => {})
    this.finish('unconfirmed')
    if (!this.closed) this.retry = setTimeout(() => this.connect(), 1500)
  }

  write(line) {
    const port = this.port
    if (port?.isOpen) port.write(`${line}\n`, (error) => { if (error) this.disconnect(port) })
  }

  deliver(id, condition, phase) {
    if (!this.ready) return phase('unavailable')
    const port = this.port
    this.status = 'busy'
    this.current = { id, phase, ack: false, timer: setTimeout(() => this.disconnect(port), 5000) }
    this.write(`PULSE ${id} ${condition.toUpperCase()}`)
  }

  receive(line) {
    const [message, value] = line.split(' ')
    const current = this.current
    if (message === 'DOCK1' && !current) {
      if (value === 'READY') this.status = 'ready'
      else if (value === 'MUTED') this.status = 'physical mute'
      else if (value === 'BUSY') this.status = 'busy'
      return
    }
    if (!current || value !== current.id) return
    if (message === 'ACK' && !current.ack) {
      current.ack = true
      current.phase('acknowledged')
    }
    if (message === 'PURGED') this.finish('purged')
    if (message === 'STOPPED') this.finish('stopped')
    if (message === 'REJECTED') this.finish('rejected')
  }

  finish(phase) {
    const current = this.current
    if (!current) return
    clearTimeout(current.timer)
    this.current = null
    if (this.port?.isOpen) this.status = 'checking'
    current.phase(phase)
    this.write('PING')
  }

  mute() { this.write('MUTE') }

  close() {
    this.closed = true
    clearInterval(this.poll)
    clearTimeout(this.retry)
    this.mute()
    if (this.port) this.disconnect(this.port)
  }
}
