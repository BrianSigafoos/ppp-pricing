serve:
	python3 -m http.server --directory docs 8000

refresh:
	node scripts/refresh_data.js

test:
	node scripts/test_yaml.js
