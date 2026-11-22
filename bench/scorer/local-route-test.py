"""The local judge route (J3) with a fake Ollama server: route selection, the call, and what a result records."""
import importlib.util, io, json, os, sys, unittest, urllib.error
from pathlib import Path
from unittest import mock

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE))
import local_route as lr  # noqa: E402

URI = 'data:image/jpeg;base64,QUJD'
MSG = [{'role': 'user', 'content': [{'type': 'text', 'text': 'which?'}, {'type': 'image_url', 'image_url': {'url': URI}},
                                    {'type': 'image_url', 'image_url': {'url': URI}}]}]


def load(name, env):
    """A fresh copy of a scorer module, imported under the given environment."""
    keep = {k: v for k, v in os.environ.items() if not k.startswith(('JUDGE_', 'BENCH_'))}
    with mock.patch.dict(os.environ, {**keep, **env}, clear=True):
        spec = importlib.util.spec_from_file_location(name.replace('.py', '') + '_under_test', HERE / name)
        m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
    return m


class Server:
    """Stands in for urlopen: records requests, answers /api/chat and /api/tags."""
    def __init__(self, replies=None, tags=('m1', 'm2')):
        self.requests, self.replies, self.tags = [], list(replies or []), tags

    def __call__(self, req, timeout=None):
        body = json.loads(req.data) if req.data else None
        self.requests.append({'url': req.full_url, 'body': body, 'headers': dict(req.header_items()), 'timeout': timeout})
        if req.full_url.endswith('/api/tags'):
            return io.BytesIO(json.dumps({'models': [{'name': t, 'digest': 'sha-' + t} for t in self.tags]}).encode())
        r = self.replies.pop(0) if self.replies else '{"choice":1}'
        if isinstance(r, Exception):
            raise r
        return io.BytesIO(json.dumps({'message': {'content': r}, 'done_reason': 'stop', 'prompt_eval_count': 300, 'eval_count': 5,
                                      'total_duration': 1.5e9, 'logprobs': [{'token': '1', 'logprob': -0.1}]}).encode())


class Settings(unittest.TestCase):
    def test_defaults_point_at_this_machine(self):
        s = lr.settings({})
        self.assertEqual((s['url'], s['host'], s['panel'], s['parallel'], s['token']),
                         ('http://localhost:11434', 'localhost:11434', list(lr.DEFAULT_PANEL), 1, None))

    def test_endpoint_and_panel_come_from_the_environment(self):
        s = lr.settings({'JUDGE_LOCAL_URL': 'https://pod-7.example.net:8443/', 'JUDGE_LOCAL_PANEL': 'a:1, b:2', 'JUDGE_LOCAL_PARALLEL': '4', 'JUDGE_LOCAL_TOKEN': 't'})
        self.assertEqual((s['url'], s['host'], s['panel'], s['parallel'], s['token']), ('https://pod-7.example.net:8443', 'pod-7.example.net:8443', ['a:1', 'b:2'], 4, 't'))

    def test_refuses_settings_it_cannot_use(self):
        for env in [{'JUDGE_LOCAL_URL': 'localhost:11434'}, {'JUDGE_LOCAL_PANEL': ''}, {'JUDGE_LOCAL_PANEL': 'a,a'}, {'JUDGE_LOCAL_PANEL': 'a,,b'},
                    {'JUDGE_LOCAL_PARALLEL': '0'}, {'JUDGE_LOCAL_PARALLEL': 'many'}]:
            with self.assertRaises(ValueError, msg=env):
                lr.settings(env)


class Call(unittest.TestCase):
    cfg = lr.settings({'JUDGE_LOCAL_PANEL': 'm1,m2'})

    def test_sends_one_ollama_chat_with_thinking_off_and_inline_images(self):
        srv = Server(['{"choice":2}'])
        raw, usage = lr.post(self.cfg, 'm1', MSG, max_tokens=8000, opener=srv)
        self.assertEqual(raw, '{"choice":2}')
        self.assertEqual((usage['provider'], usage['finish_reason'], usage['seconds'], usage['prompt_tokens']), ('local', 'stop', 1.5, 300))
        self.assertNotIn('logprobs', usage)
        (r,) = srv.requests
        self.assertEqual(r['url'], 'http://localhost:11434/api/chat')
        b = r['body']
        self.assertEqual((b['model'], b['stream'], b['think']), ('m1', False, False))
        self.assertEqual(b['options'], {'temperature': 0, 'num_ctx': 8192, 'num_predict': lr.MAX_PREDICT})
        self.assertEqual(b['messages'], [{'role': 'user', 'content': 'which?', 'images': ['QUJD', 'QUJD']}])
        self.assertNotIn('logprobs', b)
        self.assertNotIn('Authorization', r['headers'])

    def test_asks_for_log_probabilities_only_on_request_and_sends_a_token_when_set(self):
        srv = Server()
        _, usage = lr.post({**self.cfg, 'token': 'secret'}, 'm1', MSG, opener=srv, top_logprobs=5)
        self.assertEqual((srv.requests[0]['body']['logprobs'], srv.requests[0]['body']['top_logprobs']), (True, 5))
        self.assertEqual(usage['logprobs'], [{'token': '1', 'logprob': -0.1}])
        self.assertEqual(srv.requests[0]['headers']['Authorization'], 'Bearer secret')

    def test_retries_a_dropped_call_and_fails_loudly_when_the_server_is_gone(self):
        srv = Server([ConnectionRefusedError('down'), '{"choice":1}'])
        self.assertEqual(lr.post(self.cfg, 'm1', MSG, opener=srv, sleep=lambda s: None)[0], '{"choice":1}')
        srv = Server([ConnectionRefusedError('down')] * 3)
        with self.assertRaisesRegex(RuntimeError, r'local call failed \(localhost:11434, m1\)'):
            lr.post(self.cfg, 'm1', MSG, opener=srv, sleep=lambda s: None)
        srv = Server([urllib.error.HTTPError('u', 404, 'nf', {}, io.BytesIO(b'model not found'))])
        with self.assertRaisesRegex(RuntimeError, 'HTTP 404 model not found'):
            lr.post(self.cfg, 'm1', MSG, opener=srv, sleep=lambda s: None)
        self.assertEqual(len(srv.requests), 1)   # a missing model is not retried

    def test_refuses_an_image_that_is_not_inline(self):
        with self.assertRaises(ValueError):
            lr.to_ollama([{'role': 'user', 'content': [{'type': 'image_url', 'image_url': {'url': 'https://example.net/x.png'}}]}])

    def test_record_names_endpoint_and_digests_and_refuses_a_smaller_panel(self):
        r = lr.record(self.cfg, Server())
        self.assertEqual(r, {'judgeVersion': 'J3', 'judgeRoute': 'local', 'judgeEndpoint': 'localhost:11434',
                             'judgeModels': {'m1': 'sha-m1', 'm2': 'sha-m2'}, 'judgeOptions': {'think': False, 'temperature': 0, 'num_ctx': 8192}})
        with self.assertRaisesRegex(RuntimeError, 'does not hold: m2'):
            lr.record(self.cfg, Server(tags=('m1',)))


class RouteSelection(unittest.TestCase):
    def test_remote_routes_keep_j1_and_j2_and_refuse_j3(self):
        for route in ('together', 'openrouter'):
            sp = load('score_painting.py', {'JUDGE_ROUTE': route})
            self.assertEqual((sp.PROVIDER, sp.JUDGE_VERSIONS, sp.DEFAULT_JUDGE, sp.LOCAL), (route, ('J1', 'J2'), 'J1', None))
            self.assertEqual(sp.JUDGES, ['moonshotai/Kimi-K3', 'zai-org/GLM-5.3-Flash', 'Qwen/Qwen3.5-9B'])
            self.assertEqual(sp.sampling_plan('J1'), {'profile': 'J1-full', 'calls': 5, 'minValid': 3})
            with self.assertRaisesRegex(ValueError, 'unknown judge version J3'):
                sp.sampling_plan('J3')
        self.assertEqual(load('score_painting.py', {}).PROVIDER, 'together')

    def test_local_route_is_j3_with_its_own_panel_and_no_key(self):
        sp = load('score_painting.py', {'JUDGE_ROUTE': 'local', 'JUDGE_LOCAL_PANEL': 'm1,m2', 'JUDGE_LOCAL_URL': 'http://gpu-box:11434'})
        self.assertEqual((sp.PROVIDER, sp.KEY, sp.JUDGE_VERSIONS, sp.DEFAULT_JUDGE, sp.JUDGES), ('local', None, ('J3',), 'J3', ['m1', 'm2']))
        self.assertEqual(sp.LOCAL['host'], 'gpu-box:11434')
        self.assertEqual(sp.sampling_plan('J3'), {'profile': 'J3-local', 'calls': 1, 'minValid': 1})
        for old in ('J1', 'J2'):
            with self.assertRaisesRegex(ValueError, 'unknown judge version'):
                sp.sampling_plan(old)
        with self.assertRaises(ValueError):
            sp.sampling_plan('J3', 'lite')

    def test_unknown_route_and_bad_local_setting_stop_the_import(self):
        with self.assertRaises(SystemExit):
            load('score_painting.py', {'JUDGE_ROUTE': 'ollama'})
        with self.assertRaises(SystemExit):
            load('score_painting.py', {'JUDGE_ROUTE': 'local', 'JUDGE_LOCAL_URL': 'nowhere'})

    def test_local_posts_go_to_the_local_endpoint(self):
        sp = load('score_painting.py', {'JUDGE_ROUTE': 'local', 'JUDGE_LOCAL_PANEL': 'm1'})
        with mock.patch.object(sp.local_route, 'post', return_value=('ok', {'provider': 'local'})) as post:
            self.assertEqual(sp._post('m1', MSG, max_tokens=99), ('ok', {'provider': 'local'}))
        post.assert_called_once_with(sp.LOCAL, 'm1', MSG, max_tokens=99)

    def test_j3_scores_one_model_after_another_and_retries_a_bad_reply_with_the_images(self):
        sp = load('score_painting.py', {'JUDGE_ROUTE': 'local', 'JUDGE_LOCAL_PANEL': 'm1,m2'})
        good = '{"composition_values":6,"edges_detail":5,"marks_texture":4,"overall":5}'
        seen, replies = [], {'m1': [good], 'm2': ['no json here', good]}

        def post(model, messages):
            seen.append((model, sum(p['type'] == 'image_url' for p in messages[0]['content'])))
            return replies[model].pop(0), {}

        with mock.patch.object(sp, '_content', return_value=MSG[0]['content']):
            r = sp.vision_scores_j3('t', 'p', 'style', post=post)
        self.assertEqual(seen, [('m1', 2), ('m2', 2), ('m2', 2)])
        self.assertTrue(r['complete'])
        self.assertEqual((r['overall'], r['callCounts'], r['pm'], r['repeatabilityMeasured']), (5.0, {'m1': 1, 'm2': 1}, None, False))

    def test_progression_follows_the_route(self):
        self.assertIsNone(load('progression.py', {}).LOCAL)
        self.assertEqual(load('progression.py', {}).JUDGES, ['zai-org/GLM-5.3-Flash', 'Qwen/Qwen3.5-9B'])
        pg = load('progression.py', {'JUDGE_ROUTE': 'local', 'BENCH_PROG_JUDGES': 'm2'})
        self.assertEqual(pg.JUDGES, ['m2'])
        reply = json.dumps({'stages': [{'pct': p, 'score': 3, 'tells': ['c']} for p in (10, 25, 50, 75, 100)], 'humanOrder': True, 'note': 'n'})
        sheet = HERE / 'requirements.txt'   # any readable file: the fake judge never decodes it
        got = pg.ask_local('m2', sheet, 'style', post=lambda m, msgs: (reply, {}))
        self.assertEqual((got['stages'][25]['score'], got['humanOrder']), (3.0, True))
        self.assertIn('error', pg.ask_local('m2', sheet, 'style', post=lambda m, msgs: ('nothing', {})))


if __name__ == '__main__':
    unittest.main()
