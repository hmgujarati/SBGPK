"""Cleanup script for QA-created test data (kapans/karigars/staff)."""
import os
import requests
from dotenv import dotenv_values

BASE = (os.environ.get("REACT_APP_BACKEND_URL")
        or dotenv_values("/app/frontend/.env")["REACT_APP_BACKEND_URL"]).rstrip("/")
API = f"{BASE}/api"
s = requests.Session()
t = s.post(f"{API}/auth/login", json={"email": "admin@polki.com", "password": "admin123"}).json()["token"]
s.headers.update({"Authorization": f"Bearer {t}"})

for k in s.get(f"{API}/kapans").json():
    no = k["kapan_no"]
    if no.startswith(("250.50Q", "S", "T", "40.20", "60.25")):
        print("del kapan", no, s.delete(f"{API}/kapans/{k['id']}").status_code)
for k in s.get(f"{API}/karigars").json():
    if k["name"].startswith(("QA ", "TEST_")):
        print("del karigar", k["name"], s.delete(f"{API}/karigars/{k['id']}").status_code)
for u in s.get(f"{API}/users").json():
    if u["email"].startswith("qa") and u["email"].endswith("@polki.com"):
        print("del user", u["email"], s.delete(f"{API}/users/{u['id']}").status_code)
