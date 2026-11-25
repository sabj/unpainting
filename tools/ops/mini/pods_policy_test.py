"""The mini run's pod batching rule against fake queues (python3 -B pods_policy_test.py). Nothing is rented."""
import unittest
from pods_policy import decide, spent_today

NOW = 1_000_000.0
RULE = dict(min_batch=6, max_wait_s=20 * 60, cap=6, day_usd=40, slots_new=3)


def pod(name, claimed=0, slots=3, left_min=150, age_min=30):
    return {"name": name, "slots": slots, "claimed": claimed, "limit": NOW + left_min * 60, "created": NOW - age_min * 60}


class Batching(unittest.TestCase):
    def test_fewer_than_six_wait_rents_nothing(self):
        add, go, _ = decide(5, 60, [], 0, NOW, 0, **RULE)
        self.assertEqual((add, go), (0, []))

    def test_six_waiting_rent_two_pods_of_three(self):
        add, _, _ = decide(6, 60, [], 0, NOW, 0, **RULE)
        self.assertEqual(add, 2)

    def test_a_long_wait_rents_for_fewer(self):
        add, _, _ = decide(2, 21 * 60, [], 0, NOW, 0, **RULE)
        self.assertEqual(add, 1)

    def test_free_places_on_pods_up_are_used_first(self):
        add, _, _ = decide(6, 60, [pod("a", claimed=0), pod("b", claimed=1)], 0, NOW, 0, **RULE)
        self.assertEqual(add, 0)  # 5 free places: one short, under the batch and not old

    def test_pods_being_rented_count_as_places(self):
        add, _, _ = decide(7, 60, [], 2, NOW, 0, **RULE)
        self.assertEqual(add, 0)

    def test_never_above_six_pods(self):
        add, _, _ = decide(40, 60, [pod(str(i), claimed=3) for i in range(5)], 0, NOW, 0, **RULE)
        self.assertEqual(add, 1)

    def test_no_renting_once_the_day_is_spent(self):
        add, _, words = decide(12, 3600, [], 0, NOW, 40.0, **RULE)
        self.assertEqual(add, 0)
        self.assertIn("day's cap", words)

    def test_idle_pod_goes_once_nothing_waits(self):
        _, go, _ = decide(0, 0, [pod("busy", claimed=2), pod("idle")], 0, NOW, 0, **RULE)
        self.assertEqual([n for n, _ in go], ["idle"])

    def test_idle_pod_stays_while_a_final_waits(self):
        _, go, _ = decide(1, 30, [pod("idle")], 0, NOW, 0, **RULE)
        self.assertEqual(go, [])

    def test_idle_pod_near_its_limit_goes(self):
        _, go, _ = decide(3, 30, [pod("old", left_min=30)], 0, NOW, 0, **RULE)
        self.assertEqual([n for n, _ in go], ["old"])

    def test_a_new_day_starts_from_the_total_then(self):
        s, ledger = spent_today(55.0, {"day": "2026-11-24", "startTotal": 20.0}, "2026-11-24")
        self.assertEqual(s, 35.0)
        s, ledger = spent_today(55.0, ledger, "2026-11-25")
        self.assertEqual((s, ledger["startTotal"]), (0.0, 55.0))


if __name__ == "__main__":
    unittest.main()
