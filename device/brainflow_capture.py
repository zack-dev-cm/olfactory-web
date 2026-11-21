"""Read Cyton windows and stream scalar visual-response scores over stdout."""

import argparse
import json
import signal
import sys
import time

import numpy as np


class Decoder:
    def __init__(self, sample_rate, samples, frequency):
        timeline = np.arange(samples) / sample_rate
        self.trend = np.linspace(-1, 1, samples)
        frequencies = [frequency, frequency - 4, frequency - 2, frequency + 2, frequency + 4]
        self.references = []
        for target in frequencies:
            phases = 2 * np.pi * timeline[:, None] * np.array([target, 2 * target])
            reference = np.column_stack((np.sin(phases), np.cos(phases)))
            self.references.append(np.linalg.qr(reference - reference.mean(axis=0))[0])

    def score(self, channels):
        if not np.isfinite(channels).all():
            return None
        amplitude = np.ptp(channels, axis=1)
        if np.any((amplitude < 0.1) | (amplitude > 250)):
            return None
        data = channels.T - channels.mean(axis=1)
        slope = self.trend @ data / (self.trend @ self.trend)
        data -= self.trend[:, None] * slope
        basis, singular, _ = np.linalg.svd(data, full_matrices=False)
        basis = basis[:, singular > singular[0] * 0.0001]
        if basis.shape[1] == 0:
            return None
        strengths = [np.linalg.svd(basis.T @ ref, compute_uv=False)[0] for ref in self.references]
        return float(strengths[0] - max(strengths[1:]))


def capture(args):
    from brainflow.board_shim import BoardIds, BoardShim, BrainFlowInputParams

    params = BrainFlowInputParams()
    params.serial_port = args.port
    board_id = BoardIds.CYTON_BOARD.value
    available = BoardShim.get_eeg_channels(board_id)
    indices = [int(channel) - 1 for channel in args.channels.split(',')]
    if len(indices) < 2 or len(set(indices)) != len(indices) or any(not 0 <= i < len(available) for i in indices):
        raise ValueError('Select at least two distinct Cyton channels, numbered from 1 to 8.')
    rows = [available[i] for i in indices]
    timestamp_row = BoardShim.get_timestamp_channel(board_id)
    counter_row = BoardShim.get_package_num_channel(board_id)
    rate = BoardShim.get_sampling_rate(board_id)
    count = round(rate * args.window_ms / 1000)
    decoder = Decoder(rate, count, args.frequency)
    board = BoardShim(board_id, params)
    board.prepare_session()
    try:
        board.start_stream(4096)
        last_end = 0
        while True:
            time.sleep(0.2)
            chunk = board.get_current_board_data(count)
            if chunk.shape[1] != count:
                continue
            start = round(chunk[timestamp_row, 0] * 1000)
            end = round(chunk[timestamp_row, -1] * 1000)
            if end <= last_end:
                continue
            last_end = end
            continuous = np.all(np.diff(chunk[counter_row, :]) % 256 == 1)
            valid_span = args.window_ms * 0.7 <= end - start <= args.window_ms * 1.4
            score = decoder.score(chunk[rows, :]) if continuous and valid_span else None
            print(json.dumps({'start': start, 'end': end, 'score': score}), flush=True)
    finally:
        board.release_session()


def interrupted(_signal, _frame):
    raise KeyboardInterrupt


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', required=True)
    parser.add_argument('--channels', default='1,2,3')
    parser.add_argument('--frequency', required=True, type=int)
    parser.add_argument('--window-ms', required=True, type=int)
    signal.signal(signal.SIGTERM, interrupted)
    try:
        capture(parser.parse_args())
    except KeyboardInterrupt:
        pass
    except (ValueError, ImportError) as error:
        sys.exit(str(error))
