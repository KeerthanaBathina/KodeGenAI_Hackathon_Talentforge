import re
from pathlib import Path
brd = Path('.propel/generated/AI_Interview_Workflow_BRD_extracted.txt').read_text(encoding='utf-8', errors='ignore')
# grab FR rows as ID + first sentence-ish line following
lines = brd.splitlines()
fr_ids=[]
for i,l in enumerate(lines):
    m = re.fullmatch(r'FR-[A-Z]+-\d{2}', l.strip())
    if m:
        rid=m.group(0)
        req=''
        for j in range(i+1,min(i+8,len(lines))):
            t=lines[j].strip()
            if t and t not in {'High','Medium','Low','ID','Requirement','Priority','Architect Note','Acceptance Criteria'} and not re.fullmatch(r'FR-[A-Z]+-\d{2}',t):
                req=t
                break
        fr_ids.append((rid,req))

for rid,req in fr_ids:
    print(rid,'|',req)
print('Total',len(fr_ids))
