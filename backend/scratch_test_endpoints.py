import requests
import json

BASE_URL = "http://localhost:8000"  # internally inside docker network or 8001 externally

def run_tests():
    # We query port 8001 externally
    url = "http://localhost:8001"
    
    # 1. Register
    payload = {
        "name": "Super Acme Corp",
        "email": "test-operator@acme.com",
        "password": "password123"
    }
    r = requests.post(f"{url}/auth/register", json=payload)
    print("Register Response:", r.status_code, r.text)

    # 2. Login
    login_payload = {
        "username": "test-operator@acme.com",
        "password": "password123"
    }
    r_login = requests.post(f"{url}/auth/login", data=login_payload)
    print("Login Response:", r_login.status_code, r_login.text)
    
    if r_login.status_code != 200:
        return
        
    token = r_login.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 3. Get profile
    r_profile = requests.get(f"{url}/company/me", headers=headers)
    print("Company Profile Response:", r_profile.status_code, json.dumps(r_profile.json(), indent=2))

    # 4. Get projects list
    r_projects = requests.get(f"{url}/v1/projects", headers=headers)
    print("Projects Response:", r_projects.status_code, json.dumps(r_projects.json(), indent=2))

if __name__ == "__main__":
    run_tests()
