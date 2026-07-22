import re
from pathlib import Path
brd = Path('.propel/generated/AI_Interview_Workflow_BRD_extracted.txt').read_text(encoding='utf-8', errors='ignore')
spec = Path('.propel/context/docs/spec.md').read_text(encoding='utf-8', errors='ignore')

# Functional IDs in BRD are FR-REG-01 style; normalize to module+num
brd_fr = sorted(set(re.findall(r'FR-[A-Z]+-\d{2}', brd)))
spec_fr = sorted(set(re.findall(r'FR-\d{3}', spec)))

brd_br = sorted(set(re.findall(r'BR-\d{2}', brd)))
spec_br = sorted(set(re.findall(r'BR-\d{3}', spec)))

wf_brd = sorted(set(re.findall(r'WF-\d{2}', brd)))
wf_spec = sorted(set(re.findall(r'WF-\d{2}', spec)))

print('BRD FR count:', len(brd_fr))
print('Spec FR count:', len(spec_fr))
print('BRD BR count:', len(brd_br), brd_br)
print('Spec BR count:', len(spec_br), spec_br)
print('BRD WF count:', len(wf_brd), wf_brd)
print('Spec WF count:', len(wf_spec), wf_spec)

# Non-functional categories
checks = {
    'NFR section in BRD': '8. Non-Functional Requirements' in brd,
    'NFR section in spec': 'Non-Functional' in spec,
    'API Surface in BRD': '6.2 API Surface' in brd,
    'API Surface in spec': 'API Surface' in spec,
    'Data/Integration in BRD': '7. Data and Integration Requirements' in brd,
    'Data/Integration in spec': 'Data and Integration' in spec,
    'Roles matrix in BRD': '11. Roles, Permissions, and Access Matrix' in brd,
    'Roles matrix in spec': 'Roles, Permissions' in spec,
}
for k,v in checks.items():
    print(f'{k}: {v}')
