import 'dotenv/config'
import TelegramBot from 'node-telegram-bot-api'

const botToken = process.env.TELEGRAM_BOT_TOKEN
const webAppUrl =
  process.env.WEB_APP_URL || 'https://olfactory-web-1095464065298.us-east1.run.app'
const referenceUrl = 'https://writetobrain.com/olfactory'

if (!botToken) {
  throw new Error('TELEGRAM_BOT_TOKEN is required')
}

const bot = new TelegramBot(botToken, { polling: true })

const introText = `Olfactory ultrasound coach

- Launch the web mini-app to see placement steps and run pulse presets.
- Place phone above the glabella, tilt 50–55° downward, nudge 2–4 mm left/right.
- Keep gain under 0.7 and sessions under 2 minutes. Not a medical device.`

const keyboard = {
  reply_markup: {
    inline_keyboard: [
      [{ text: 'Open placement coach', web_app: { url: webAppUrl } }],
      [{ text: 'Open in browser', url: webAppUrl }],
      [{ text: 'Reference writeup', url: referenceUrl }],
    ],
  },
}

bot.onText(/\/start|\/help/i, (msg) => {
  bot.sendMessage(msg.chat.id, introText, keyboard)
})

bot.on('message', (msg) => {
  if (msg.text && /\/start|\/help/i.test(msg.text)) return
  bot.sendMessage(msg.chat.id, 'Tap below to open the placement coach.', keyboard)
})

bot.on('polling_error', (err) => {
  console.error('Polling error', err)
})

console.log(
  `Telegram bot is live. Web app: ${webAppUrl} | Reference: ${referenceUrl}`,
)
