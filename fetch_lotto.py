import csv, json, os, subprocess, sys, time

URL = "https://www.dhlottery.co.kr/lt645/selectPstLt645InfoNew.do?srchDir=center&srchLtEpsd={}"
HEADERS = {
    "User-Agent": "Mozilla/5.0",
    "X-Requested-With": "XMLHttpRequest",
    "Accept": "application/json",
    "Referer": "https://www.dhlottery.co.kr/lt645/result",
}
out = sys.argv[1]

def fetch(epsd):
    cmd = ["curl", "-s", "--max-time", "30", "--retry", "3", URL.format(epsd)]
    for k, v in HEADERS.items():
        cmd += ["-H", f"{k}: {v}"]
    out = subprocess.run(cmd, capture_output=True, check=True).stdout
    return json.loads(out)["data"]["list"]

# 기존 CSV가 있으면 그 뒤 회차만 받는다 (서버 부담 줄이기)
draws = {}
if os.path.exists(out):
    with open(out, encoding="utf-8-sig") as f:
        for r in csv.DictReader(f):
            d = {"ltEpsd": int(r["회차"]), "ltRflYmd": r["추첨일"].replace("-", ""),
                 "bnsWnNo": int(r["보너스"]), "rnk1WnNope": int(r["1등당첨자수"]),
                 "rnk1WnAmt": int(r["1등1인당금액"])}
            for i in range(1, 7):
                d[f"tm{i}WnNo"] = int(r[f"번호{i}"])
            draws[d["ltEpsd"]] = d
before = len(draws)
epsd = max(draws) + 1 if draws else 1
while True:
    lst = fetch(epsd)
    new = [d for d in lst if d["ltEpsd"] not in draws]
    for d in lst:
        draws[d["ltEpsd"]] = d
    top = max(draws)
    if not new or top < epsd:
        break
    epsd = top + 1
    time.sleep(0.3)

rows = sorted(draws.values(), key=lambda d: d["ltEpsd"])
with open(out, "w", newline="", encoding="utf-8-sig") as f:
    w = csv.writer(f)
    w.writerow(["회차", "추첨일", "번호1", "번호2", "번호3", "번호4", "번호5", "번호6", "보너스",
                "1등당첨자수", "1등1인당금액"])
    for d in rows:
        y = d["ltRflYmd"]
        w.writerow([d["ltEpsd"], f"{y[:4]}-{y[4:6]}-{y[6:]}",
                    *[d[f"tm{i}WnNo"] for i in range(1, 7)], d["bnsWnNo"],
                    d["rnk1WnNope"], d["rnk1WnAmt"]])

# 생성기(lotto_generator.html)가 읽는 데이터 파일
js_path = os.path.join(os.path.dirname(os.path.abspath(out)), "lotto_data.js")
data = [[d["ltEpsd"], d["ltRflYmd"], *[d[f"tm{i}WnNo"] for i in range(1, 7)], d["bnsWnNo"]] for d in rows]
with open(js_path, "w", encoding="utf-8", newline="\n") as f:
    f.write("window.LOTTO = " + json.dumps(data, separators=(",", ":")) + ";\n")

eps = [d["ltEpsd"] for d in rows]
missing = sorted(set(range(1, max(eps) + 1)) - set(eps))
print(f"{len(rows)} draws (+{len(rows) - before}), {eps[0]}..{eps[-1]}, missing={missing[:20]}")
print("last:", rows[-1]["ltEpsd"], rows[-1]["ltRflYmd"], [rows[-1][f"tm{i}WnNo"] for i in range(1, 7)], rows[-1]["bnsWnNo"])
