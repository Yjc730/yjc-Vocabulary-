// 簡化 SM-2 思路：越熟隔越久
export function nextSRSState(prev, score) {
  const now = new Date();

  let { repetitions = 0, intervalDays = 0, ease = 2.3 } = prev || {};

  if (score <= 1) {
    repetitions = 0;
    intervalDays = 1;              // 明天再見
    ease = Math.max(1.3, ease - 0.2);
  } else {
    repetitions += 1;
    ease = Math.min(2.8, ease + (score === 3 ? 0.1 : 0.02));

    if (repetitions === 1) intervalDays = 1;
    else if (repetitions === 2) intervalDays = 3;
    else intervalDays = Math.round(intervalDays * ease);
  }

  const due = new Date(now);
  due.setDate(due.getDate() + intervalDays);

  return {
    repetitions,
    intervalDays,
    ease,
    lastReviewedAt: now.toISOString(),
    dueAt: due.toISOString(),
  };
}
