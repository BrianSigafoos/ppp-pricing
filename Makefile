serve:
	python3 -m http.server --directory docs 8000

refresh:
	node scripts/refresh_data.js
