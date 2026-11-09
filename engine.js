// 로또 흐름 엔진: 후보 알고리즘 여러 개를 최근 회차에 적용해 보고,
// 실제 다음 회차를 가장 잘 맞힌 알고리즘으로 새 회차 번호 점수를 낸다.
// 모든 후보는 기준 회차를 포함한 최근 최대 3개 회차를 입력으로 쓴다.
(function (root) {
  const MIN_HIST = 50; // 후보 성적을 매기기 시작하는 최소 회차 수

  function buildEngine(rows) {
    const T = rows.length;
    const nums = rows.map(r => r.n);
    const has = nums.map(ns => { const a = new Uint8Array(47); ns.forEach(x => a[x] = 1); return a; });
    const sums = nums.map(ns => ns.reduce((a, b) => a + b, 0));
    const odds = nums.map(ns => ns.filter(x => x % 2).length);
    const lows = nums.map(ns => ns.filter(x => x <= 22).length);

    // 회차 간 유사도 (기존 방식과 같은 기준)
    function simOf(a, b) {
      let ov = 0, near = 0;
      const hb = has[b];
      for (const x of nums[a]) {
        if (hb[x]) ov++;
        else if (hb[x - 1] || hb[x + 1]) near++;
      }
      return 3 * ov + 0.5 * near + (odds[a] === odds[b] ? 1 : 0) + (lows[a] === lows[b] ? 1 : 0)
        + Math.max(0, 1 - Math.abs(sums[a] - sums[b]) / 60);
    }
    const S = new Float32Array(T * T);
    for (let a = 0; a < T; a++) for (let b = 0; b <= a; b++) S[a * T + b] = S[b * T + a] = simOf(a, b);

    const LAGW = [1, 0.6, 0.36]; // 최근 회차일수록 비중 큼
    const cands = [];
    const add = (id, name, desc, fn) => cands.push({ id, name, desc, fn });
    for (let k = 1; k <= 3; k++) {
      add(`sim${k}`, `닮은 흐름 ${k}회`, `최근 ${k}회의 흐름과 닮았던 과거 구간의 다음 회차 번호`, t => {
        const sc = new Float64Array(46);
        let wsum = 0; for (let j = 0; j < k; j++) wsum += LAGW[j];
        for (let i = k - 1; i < t; i++) {
          let s = 0;
          for (let j = 0; j < k; j++) s += LAGW[j] * S[(i - j) * T + (t - j)];
          s /= wsum;
          const w = s * s;
          for (const x of nums[i + 1]) sc[x] += w;
        }
        return sc;
      });
    }
    for (let k = 1; k <= 3; k++) {
      add(`rep${k}`, `재등장 ${k}회`, `최근 ${k}회에 나온 번호와 그 ±1 이웃이 다시 나온다고 봄`, t => {
        const sc = new Float64Array(46);
        for (let j = 0; j < k; j++) for (const x of nums[t - j]) {
          sc[x] += LAGW[j];
          if (x > 1) sc[x - 1] += 0.4 * LAGW[j];
          if (x < 45) sc[x + 1] += 0.4 * LAGW[j];
        }
        return sc;
      });
    }
    for (let k = 1; k <= 3; k++) {
      add(`cold${k}`, `쉬어간 번호 ${k}회`, `최근 ${k}회에 안 나온 번호가 나온다고 봄 (오래 쉰 번호 조금 더)`, t => {
        const sc = new Float64Array(46);
        for (let x = 1; x <= 45; x++) sc[x] = 1 + Math.min(t - lastSeen[x], 30) / 100;
        for (let j = 0; j < k; j++) for (const x of nums[t - j]) sc[x] = 0.2;
        return sc;
      });
    }
    // 번호 이동: "x가 나오면 L회 뒤에 y가 나온" 역대 횟수
    const trans = [1, 2, 3].map(() => new Float64Array(46 * 46));
    const transRow = [1, 2, 3].map(() => new Float64Array(46));
    for (let k = 1; k <= 3; k++) {
      add(`tr${k}`, `번호 이동 ${k}회`, `역대 “이 번호 다음엔 저 번호” 이동 횟수를 최근 ${k}회에 적용`, t => {
        const sc = new Float64Array(46);
        for (let j = 0; j < k; j++) {
          const C = trans[j], R = transRow[j]; // j+1회 간격
          for (const x of nums[t - j]) {
            if (!R[x]) continue;
            for (let y = 1; y <= 45; y++) sc[y] += LAGW[j] * C[x * 46 + y] / R[x];
          }
        }
        return sc;
      });
    }
    add('freq', '전체 빈도', '1회부터 지금까지 많이 나온 번호 (비교용 기준선)', null);

    const C = cands.length;
    const P = new Float32Array(C * T * 46); // 정규화된 번호 확률
    const perf = new Float32Array(C * T).fill(NaN); // t 기준 예측이 t+1을 맞힌 기대 일치 개수
    const freq = new Float64Array(46);
    const lastSeen = new Int32Array(46).fill(-1);

    for (let t = 0; t < T; t++) {
      for (const x of nums[t]) { freq[x]++; lastSeen[x] = t; }
      for (let L = 1; L <= 3; L++) { // t회를 도착점으로 하는 이동 기록 추가
        if (t - L < 0) continue;
        const Cm = trans[L - 1], R = transRow[L - 1];
        for (const x of nums[t - L]) { R[x]++; for (const y of nums[t]) Cm[x * 46 + y]++; }
      }
      if (t < 2) continue;
      for (let c = 0; c < C; c++) {
        const sc = cands[c].fn ? cands[c].fn(t) : freq;
        let sum = 0; for (let x = 1; x <= 45; x++) sum += sc[x];
        const eps = (sum / 45 || 1) * 0.05;
        const tot = sum + eps * 45;
        const off = (c * T + t) * 46;
        for (let x = 1; x <= 45; x++) P[off + x] = (sc[x] + eps) / tot;
        if (t + 1 < T) {
          let e = 0; for (const y of nums[t + 1]) e += P[off + y];
          perf[c * T + t] = 6 * e;
        }
      }
    }

    const probs = (c, t) => P.subarray((c * T + t) * 46, (c * T + t + 1) * 46);
    const top6 = p => [...Array(45).keys()].map(i => i + 1).sort((a, b) => p[b] - p[a] || freq[b] - freq[a]).slice(0, 6).sort((a, b) => a - b);

    // t 기준으로 직전 N번의 "알고리즘 적용 → 실제 다음 회차" 성적을 매겨 순위
    function rank(t, N) {
      const from = Math.max(MIN_HIST, t - N);
      const out = cands.map((cd, c) => {
        let s = 0, n = 0;
        for (let v = from; v < t; v++) { s += perf[c * T + v]; n++; }
        return { c, cand: cd, avg: n ? s / n : 0, n };
      });
      return out.sort((a, b) => b.avg - a.avg || a.c - b.c);
    }

    // 검증 내역: 직전 N번 동안 고른 알고리즘이 각 회차에서 뭘 뽑았는지
    function history(t, N, c) {
      const out = [];
      for (let v = Math.max(MIN_HIST, t - N); v < t; v++) {
        const pick = top6(probs(c, v));
        const real = nums[v + 1];
        out.push({ from: v, to: v + 1, pick, real, hit: pick.filter(x => real.includes(x)).length, exp: perf[c * T + v] });
      }
      return out;
    }

    // 과거 전체를 따라가며 "최근 N회 최고 알고리즘"을 썼다면 평균 몇 개 맞았나
    function backtest(N, start) {
      const fixed = new Float64Array(C);
      let meta = 0, n = 0;
      const dist = [0, 0, 0, 0, 0, 0, 0];
      for (let t = start; t < T - 1; t++) {
        const best = rank(t, N)[0].c;
        const h = top6(probs(best, t)).filter(x => nums[t + 1].includes(x)).length;
        meta += h; dist[h]++; n++;
        for (let c = 0; c < C; c++) fixed[c] += top6(probs(c, t)).filter(x => nums[t + 1].includes(x)).length;
      }
      return { avg: meta / n, n, dist, fixed: [...fixed].map((s, c) => ({ cand: cands[c], avg: s / n })) };
    }

    return { T, cands, probs, top6, rank, history, backtest, MIN_HIST };
  }

  root.LottoEngine = { buildEngine };
  if (typeof module !== 'undefined') module.exports = { buildEngine };
})(typeof window !== 'undefined' ? window : globalThis);
