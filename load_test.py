import time
import requests
from concurrent.futures import ThreadPoolExecutor

API_URL = "http://localhost:8001/v1/gateway/test"
TARGET_RPS = 500

base_payload = {
    "api_key": "gAAAAABqYnknkV9An0EPnf4KAA6v_1sAjVQke4JEauQRWAxcoW_ZhK1zKqk6pak7TxCPt74dMKJhTmuianKXAKlhEPkA_FhizbCClKopERj288QTjfp2Ni82bm_QYkRMUmR784txA6Q8eRo-HceybIcb052pGgKfOU56cUKRGzKulDss2kxXcKQ=",
    "secret_key": "whsec_d4iGCRvYi6IHaxwphhbNYiwxXGNIEoylNb945O1FF80",
    "event_type": "webhook.received",
    "payload": {
        "event": "webhook.received",
        "order_id": "ord_loadtest",
        "amount": 100
    }
}

# Use a global session for connection pooling with high limits
session = requests.Session()
adapter = requests.adapters.HTTPAdapter(pool_connections=2000, pool_maxsize=2000)
session.mount('http://', adapter)
session.mount('https://', adapter)

def fetch(index):
    try:
        # Create a unique payload for each request
        payload = dict(base_payload)
        payload["payload"] = dict(base_payload["payload"])
        payload["payload"]["order_id"] = f"ord_loadtest_{index}"
        
        response = session.post(API_URL, json=payload, timeout=5)
        return response.status_code
    except Exception as e:
        return str(e)

def main():
    print(f"Starting ThreadPool load test at {TARGET_RPS} requests per second...")
    print(f"Target URL: {API_URL}")
    print("Press Ctrl+C to stop.")
    
    # We use enough workers to handle concurrent outgoing requests
    executor = ThreadPoolExecutor(max_workers=TARGET_RPS)
    
    request_count = 0
    try:
        while True:
            start_time = time.time()
            
            # Fire off batch of tasks
            futures = [executor.submit(fetch, request_count + i) for i in range(TARGET_RPS)]
            request_count += TARGET_RPS
            
            # Wait for all to complete in this batch
            results = [f.result() for f in futures]
            
            success = results.count(200)
            other = len(results) - success
            print(f"Sent {TARGET_RPS} requests | Success (200): {success} | Failed/Other: {other}")
            
            # Sleep remainder of the second to maintain RPS
            elapsed = time.time() - start_time
            if elapsed < 1.0:
                time.sleep(1.0 - elapsed)
                
    except KeyboardInterrupt:
        print("\nLoad test stopped.")
    finally:
        executor.shutdown(wait=False)

if __name__ == "__main__":
    main()
