import os
import re

html_files = [
    'admin.html', 'dashboard.html', 'edit-test.html', 'index.html',
    'proctor-session.html', 'question-review.html', 'results.html',
    'review.html', 'test.html'
]

for filename in html_files:
    filepath = os.path.join('/home/sadrikov49/Desktop/ALFA SAT PROJECT/ALFA_SAT', filename)
    if os.path.exists(filepath):
        with open(filepath, 'r') as f:
            content = f.read()

        # Add ?v=2.2 to all local js/ and css/ files
        # First remove any existing ?v=...
        content = re.sub(r'src="(js/[^"]+)(\?v=[0-9.]+)?', r'src="\1?v=2.2', content)
        content = re.sub(r'href="(css/[^"]+)(\?v=[0-9.]+)?', r'href="\1?v=2.2', content)

        with open(filepath, 'w') as f:
            f.write(content)

print("Cache buster ?v=2.2 applied to all local JS and CSS links in HTML files.")
