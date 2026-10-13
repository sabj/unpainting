"""Call accounting in score_painting.py for judge versions J1 and J2, with a fake HTTP layer: no network, no key."""
import importlib.util
import threading
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('score_painting', Path(__file__).with_name('score_painting.py'))
sp = importlib.util.module_from_spec(spec); spec.loader.exec_module(sp)

GOOD = '{"composition_values":6,"edges_detail":5,"marks_texture":4,"overall":5}'
QWEN = 'Qwen/Qwen3.5-9B'


class Fake:
    """Stands in for sp._post (J1) and sp._post_j2 (J2). replies(model, n, messages) gives the n-th reply for a model
    as (content, finish_reason), or an exception to raise. Every request is recorded."""

    def __init__(self, replies):
        self.replies, self.calls, self.count, self.lock = replies, [], {}, threading.Lock()

    def _next(self, model, messages, max_tokens):
        with self.lock:
            n = self.count.get(model, 0); self.count[model] = n + 1
            self.calls.append({'model': model, 'messages': messages, 'max_tokens': max_tokens})
        return self.replies(model, n, messages)

    def post_j1(self, model, messages, max_tokens=8000, timeout=150, retries=3):
        r = self._next(model, messages, max_tokens)
        if isinstance(r, Exception):
            raise r
        return r[0], {}

    def post_j2(self, model, messages, max_tokens=8000, timeout=150, retries=3, log=None):
        r = self._next(model, messages, max_tokens)
        if isinstance(r, Exception):
            log is not None and log.append({'status': 503, 'error': str(r)})
            raise r
        log is not None and log.append({'status': 200, 'finish_reason': r[1], 'maxTokens': max_tokens})
        return r[0], {}, r[1]


def text_only(messages):
    return isinstance(messages[0]['content'], str)


class Base(unittest.TestCase):
    def setUp(self):
        self.saved = sp._post, sp._post_j2, sp.data_uri, sp.load_rgb, sp.classic_scores
        sp.data_uri, sp.load_rgb = (lambda img: 'data:,x'), (lambda p: p)
        sp.classic_scores = lambda t, i: {'metrics': {'value': 6.0, 'edge': 6.0, 'landmark': None, 'marks': 6.0}, 'mean': 6.0}

    def tearDown(self):
        sp._post, sp._post_j2, sp.data_uri, sp.load_rgb, sp.classic_scores = self.saved

    def run_score(self, judge, replies):
        fake = Fake(replies)
        sp._post, sp._post_j2 = fake.post_j1, fake.post_j2
        return sp.score('t.png', 'p.png', 'ink', judge=judge), fake


class J1Unchanged(Base):
    def test_default_is_j1(self):
        r, _ = self.run_score(None, lambda m, n, msg: (GOOD, 'stop'))
        self.assertEqual(r['judgeVersion'], 'J1')
        self.assertEqual(r['composite'], 5.5)
        self.assertEqual(r['callCounts'], {m: 5 for m in sp.JUDGES})

    def test_j1_accepts_three_valid_calls(self):
        # Qwen gives prose from its 4th request on, and the text-only repair fails too: J1 keeps the judge on 3 calls
        r, _ = self.run_score('J1', lambda m, n, msg: (GOOD, 'stop') if (m != QWEN or n < 3) else ('prose', 'stop'))
        self.assertTrue(r['complete'])
        self.assertEqual(r['callCounts'][QWEN], 3)
        self.assertEqual(r['minValidCalls'], 3)

    def test_j1_counts_a_text_only_repair(self):
        r, fake = self.run_score('J1', lambda m, n, msg: (GOOD, 'stop') if text_only(msg) or n > 0 else ('prose', 'stop'))
        self.assertTrue(r['complete'])
        self.assertEqual(sum(text_only(c['messages']) for c in fake.calls), 3)


class J2(Base):
    def test_three_valid_calls_are_not_enough(self):
        r, _ = self.run_score('J2', lambda m, n, msg: (GOOD, 'stop') if (m != QWEN or n < 3) else ('prose', 'stop'))
        self.assertFalse(r['complete'])
        self.assertIsNone(r['composite'])
        self.assertEqual(r['callCounts'][QWEN], 3)
        self.assertEqual(r['minValidCalls'], 5)
        self.assertEqual(r['judgeVersion'], 'J2')

    def test_failed_calls_are_retried_to_five(self):
        r, _ = self.run_score('J2', lambda m, n, msg: RuntimeError('HTTP 503') if n < 2 else (GOOD, 'stop'))
        self.assertTrue(r['complete'])
        self.assertEqual(r['callCounts'], {m: 5 for m in sp.JUDGES})
        self.assertTrue(any(a['status'] == 503 for a in r['visionAttempts']))

    def test_no_text_only_repair(self):
        r, fake = self.run_score('J2', lambda m, n, msg: ('prose', 'stop') if n == 0 else (GOOD, 'stop'))
        self.assertTrue(r['complete'])
        self.assertFalse(any(text_only(c['messages']) for c in fake.calls))
        for c in fake.calls:
            self.assertEqual(sum(p.get('type') == 'image_url' for p in c['messages'][0]['content']), 2)

    def test_cut_off_reply_is_retried_with_more_tokens(self):
        r, fake = self.run_score('J2', lambda m, n, msg: ('{"composition_values":6,"edg', 'length') if n == 0 else (GOOD, 'stop'))
        self.assertTrue(r['complete'])
        self.assertIn(sp.J2_MAX_TOKENS * 2, [c['max_tokens'] for c in fake.calls])
        self.assertEqual(sum(a.get('finish_reason') == 'length' for a in r['visionAttempts']), 3)
        self.assertTrue(all('attempt' in a and 'slot' in a for a in r['visionAttempts']))

    def test_same_score_as_j1_when_every_call_is_valid(self):
        good = lambda m, n, msg: (GOOD, 'stop')
        self.assertEqual(self.run_score('J2', good)[0]['composite'], self.run_score('J1', good)[0]['composite'])

    def test_unknown_version_is_refused(self):
        with self.assertRaises(ValueError):
            self.run_score('J3', lambda m, n, msg: (GOOD, 'stop'))


if __name__ == '__main__':
    unittest.main()
