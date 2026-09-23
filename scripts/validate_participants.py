import os
import sys
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'backend')))
import requests
import json

BASE = 'http://127.0.0.1:8000'

# 1. Admin login
login_res = requests.post(f'{BASE}/api/v1/auth/login', data={'username': 'admin', 'password': 'admin123'})
assert login_res.status_code == 200, f'Login failed: {login_res.text}'
token = login_res.json()['access_token']
headers = {'Authorization': f'Bearer {token}'}

# 2. Get active event
active_res = requests.get(f'{BASE}/api/v1/events/active')
active_event = active_res.json()
event_id = active_event['id']
print(f"Active Event: Name={active_event.get('name')}, ID={event_id}, CustomID={active_event.get('custom_id')}")

# 3. Start Participant A: ragul2 / TEST001
start_a = requests.post(
    f'{BASE}/api/v1/game/session/start',
    json={'player_name': 'ragul2', 'register_number': 'TEST001', 'event_id': event_id}
)
assert start_a.status_code == 201, f'Start A failed: {start_a.text}'
sess_a = start_a.json()
sess_a_id = sess_a['session_id']

# 4. Start Participant B: ragul3 / TEST002
start_b = requests.post(
    f'{BASE}/api/v1/game/session/start',
    json={'player_name': 'ragul3', 'register_number': 'TEST002', 'event_id': event_id}
)
assert start_b.status_code == 201, f'Start B failed: {start_b.text}'
sess_b = start_b.json()
sess_b_id = sess_b['session_id']

print(f"Started Sess A: {sess_a_id} (ragul2) | Sess B: {sess_b_id} (ragul3)")

# 5. Query Admin Participants - BOTH MUST APPEAR AS PLAYING
p_res1 = requests.get(f'{BASE}/api/v1/admin/participants', headers=headers)
p_data1 = p_res1.json()['sessions']
item_a_1 = next((s for s in p_data1 if s['session_id'] == sess_a_id), None)
item_b_1 = next((s for s in p_data1 if s['session_id'] == sess_b_id), None)

print("\n--- STEP 5: Verification of Both Live Participants (PLAYING) ---")
print(f"Participant A in Admin: Name={item_a_1['player_name']}, Reg={item_a_1['register_number']}, Status={item_a_1['status']}, Event={item_a_1['event_name']}")
print(f"Participant B in Admin: Name={item_b_1['player_name']}, Reg={item_b_1['register_number']}, Status={item_b_1['status']}, Event={item_b_1['event_name']}")
assert item_a_1 is not None and item_a_1['status'] == 'PLAYING'
assert item_b_1 is not None and item_b_1['status'] == 'PLAYING'

# 6. Complete stage and finish session for Participant A
from app.database import SessionLocal
from app.models import Socket
db = SessionLocal()

curr_q = sess_a['current_question']
while curr_q:
    slots = curr_q.get('sockets') or curr_q.get('slots') or []
    for slot in slots:
        sock = db.query(Socket).filter(Socket.id == slot['id']).first()
        comp = sock.accepted_component_id if sock else 'battery'
        drop_res = requests.post(
            f'{BASE}/api/v1/game/placement/attempt',
            json={'session_id': sess_a_id, 'question_id': curr_q['id'], 'socket_id': slot['id'], 'component_id': comp}
        )
        assert drop_res.status_code == 200 and drop_res.json()['correct'] is True
    
    comp_res = requests.post(
        f'{BASE}/api/v1/game/question/complete',
        json={'session_id': sess_a_id, 'question_id': curr_q['id']}
    ).json()
    curr_q = comp_res.get('next_question')

db.close()

fin_a = requests.post(f'{BASE}/api/v1/game/session/finish', json={'session_id': sess_a_id})
assert fin_a.status_code == 200
print(f"\nParticipant A Finished: Rank={fin_a.json().get('rank')}, FinalTimeMs={fin_a.json().get('final_time_ms')}ms")

# 7. Query Admin Participants again (simulating Admin Page Refresh)
p_res2 = requests.get(f'{BASE}/api/v1/admin/participants', headers=headers)
p_data2 = p_res2.json()['sessions']
item_a_2 = next((s for s in p_data2 if s['session_id'] == sess_a_id), None)
item_b_2 = next((s for s in p_data2 if s['session_id'] == sess_b_id), None)

print("\n--- STEP 7: Verification After Completion (Page Refresh) ---")
print(f"Participant A in Admin: Name={item_a_2['player_name']}, Reg={item_a_2['register_number']}, Status={item_a_2['status']}, FinalTimeMs={item_a_2['final_time_ms']}ms")
print(f"Participant B in Admin: Name={item_b_2['player_name']}, Reg={item_b_2['register_number']}, Status={item_b_2['status']}, FinalTimeMs={item_b_2['final_time_ms']}")
assert item_a_2 is not None and item_a_2['status'] == 'COMPLETED'
assert item_a_2['final_time_ms'] is not None and item_a_2['final_time_ms'] > 0
assert item_b_2 is not None and item_b_2['status'] == 'PLAYING'

print("\n[SUCCESS] ALL VERIFICATION CHECKS PASSED PERFECTLY!")
