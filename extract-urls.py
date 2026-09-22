import json, re

with open('/tmp/ig-post-today.json') as f:
    d = json.load(f)
html = d.get('data', d).get('html', '')

# Find URL #3 — same photo ID as og:image but WITHOUT crop
# Photo ID: 818553348_18014792135939877_2905814445329882582
all_urls = re.findall(r'https://scontent[^"\x27\s]+', html)

for u in all_urls:
    u_clean = u.replace('&amp;', '&')
    if '818553348' in u_clean and 'c216' not in u_clean and 's640x640' not in u_clean:
        print(f"FULL RES (no crop): {u_clean}")
        break

# Also find the 82787-19 URLs (different resolution)
for u in all_urls:
    u_clean = u.replace('&amp;', '&')
    if '82787-19' in u_clean:
        print(f"82787-19 URL: {u_clean[:150]}")
        break
