#!/usr/bin/env python3
"""Generate Chinese narration MP3s via xAI TTS."""
from __future__ import annotations

import json
import os
import ssl
import sys
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

ROOT = Path("/workspace/public/audio")
API = "https://api.x.ai/v1/tts"
KEY = os.environ.get("XAI_API_KEY", "")
if not KEY:
    print("XAI_API_KEY missing", file=sys.stderr)
    sys.exit(1)

PAGES: list[tuple[str, str, str]] = [
    ("shou-zhu", "p0", "小朋友，我们来听成语故事：守株待兔。"),
    ("shou-zhu", "p1", "从前，有一个农夫，每天都在田里辛勤地干活。"),
    ("shou-zhu", "p2", "有一天，一只兔子跑得太快，一下子撞到了树桩上。"),
    ("shou-zhu", "p3", "农夫捡到了兔子，高兴极了。他想：要是天天都能捡到兔子，该多好啊！"),
    ("shou-zhu", "p4", "从那天起，农夫天天坐在树桩旁边等兔子。田里的庄稼都荒了。"),
    ("shou-zhu", "p5", "可是，兔子再也没有来。农夫又饿又后悔。"),
    ("shou-zhu", "moral", "守株待兔，是说不能把偶然发生的好事，当成永远的办法。好运气不会天天来，还是要自己努力做事哦。"),
    ("hu-jia", "p0", "小朋友，我们来听成语故事：狐假虎威。"),
    ("hu-jia", "p1", "森林里有一只大老虎，它抓住了一只小狐狸。"),
    ("hu-jia", "p2", "狐狸灵机一动，说：你不能吃我！天帝派我来当百兽之王。"),
    ("hu-jia", "p3", "老虎半信半疑。狐狸说：不信的话，你跟在我后面走一走就知道了。"),
    ("hu-jia", "p4", "狐狸大摇大摆地走在前面，老虎跟在后面。小动物们看见老虎，都吓得跑开了。"),
    ("hu-jia", "p5", "老虎以为大家怕的是狐狸。其实，大家怕的是它自己呀！"),
    ("hu-jia", "moral", "狐假虎威，是说有的人只是借别人的威风来吓唬人。我们要看清楚，真正厉害的到底是谁。"),
    ("yan-er", "p0", "小朋友，我们来听成语故事：掩耳盗铃。"),
    ("yan-er", "p1", "有一个人，看见人家门口挂着一口大铃铛，就想把它摘下来。"),
    ("yan-er", "p2", "他伸手去摘铃铛。铃铛一响，叮铃叮铃，声音好大。"),
    ("yan-er", "p3", "他心想：要是把耳朵捂住，不就听不见了吗？"),
    ("yan-er", "p4", "于是他捂住自己的耳朵，用力去摘铃铛。"),
    ("yan-er", "p5", "铃铛还是响了，邻居们都跑出来，把他叫住了。"),
    ("yan-er", "moral", "掩耳盗铃，是说自己骗自己是没有用的。做错事的时候，别人还是会知道。"),
    ("wang-yang", "p0", "小朋友，我们来听成语故事：亡羊补牢。"),
    ("wang-yang", "p1", "从前有个人养了一群小羊。一天早上，他发现少了一只羊。"),
    ("wang-yang", "p2", "原来羊圈破了一个洞，晚上狼钻进来，叼走了一只羊。"),
    ("wang-yang", "p3", "邻居劝他：快把羊圈修好吧！他说：羊都丢了，修它有什么用？"),
    ("wang-yang", "p4", "第二天，狼又从那个洞钻进来，又叼走了一只羊。"),
    ("wang-yang", "p5", "他后悔了，连忙把羊圈修好。从此，狼再也进不来了。"),
    ("wang-yang", "moral", "亡羊补牢，是说出了错不要紧，赶快改正还来得及。现在补救，以后就不会再丢了。"),
    ("jing-di", "p0", "小朋友，我们来听成语故事：井底之蛙。"),
    ("jing-di", "p1", "一口浅井里住着一只小青蛙。它天天坐在井底，抬头只看得见一小块天。"),
    ("jing-di", "p2", "有一天，一只大海龟路过，探头跟青蛙打招呼。"),
    ("jing-di", "p3", "青蛙骄傲地说：你看，这里多宽敞！我是这里的大王！"),
    ("jing-di", "p4", "海龟告诉它：大海比这口井大得多，大得望不到边。"),
    ("jing-di", "p5", "青蛙听了，愣住了。原来外面的世界这么大呀！"),
    ("jing-di", "moral", "井底之蛙，是说如果只看自己身边的一小块地方，就会以为世界只有这么大。多看看外面，才能学到更多。"),
    ("hua-long", "p0", "小朋友，我们来听成语故事：画龙点睛。"),
    ("hua-long", "p1", "古时候，有一位画家叫张僧繇，他画的龙特别好看。"),
    ("hua-long", "p2", "有一天，他在寺庙的墙上画了四条龙，可是都没有画眼睛。"),
    ("hua-long", "p3", "大家问：为什么不画眼睛呢？他说：画了眼睛，龙就会飞走。"),
    ("hua-long", "p4", "大家不信，请他画上眼睛。他提起笔，给两条龙点上了眼睛。"),
    ("hua-long", "p5", "忽然电闪雷鸣，那两条龙真的飞上了天！另外两条没有眼睛的龙，还留在墙上。"),
    ("hua-long", "moral", "画龙点睛，是说最关键的那一笔最重要。做事的时候，把最要紧的地方做好，整件事就会活起来。"),
]


def fetch(item: tuple[str, str, str]) -> str:
    story, page, text = item
    dest = ROOT / story / f"{page}.mp3"
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists() and dest.stat().st_size > 2000:
        return f"skip {story}/{page}"
    body = json.dumps(
        {"text": text, "voice_id": "luna", "language": "zh"},
        ensure_ascii=False,
    ).encode("utf-8")
    req = urllib.request.Request(
        API,
        data=body,
        method="POST",
        headers={
            "Authorization": f"Bearer {KEY}",
            "Content-Type": "application/json",
        },
    )
    ctx = ssl.create_default_context()
    last_err = None
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=60, context=ctx) as res:
                data = res.read()
            if len(data) < 1000:
                raise RuntimeError(f"tiny payload {len(data)}")
            dest.write_bytes(data)
            return f"ok {story}/{page} {len(data)}"
        except Exception as e:  # noqa: BLE001
            last_err = e
            time.sleep(1.2 * (attempt + 1))
    return f"FAIL {story}/{page} {last_err}"


def main() -> None:
    ok = 0
    fail = 0
    with ThreadPoolExecutor(max_workers=6) as pool:
        futs = [pool.submit(fetch, item) for item in PAGES]
        for fut in as_completed(futs):
            msg = fut.result()
            print(msg, flush=True)
            if msg.startswith("FAIL"):
                fail += 1
            else:
                ok += 1
    print(f"done ok={ok} fail={fail}")
    if fail:
        sys.exit(1)


if __name__ == "__main__":
    main()
