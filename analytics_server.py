from flask import Flask, request, jsonify, make_response
from flask_cors import CORS
import sqlite3
import datetime
import os
import json

app = Flask(__name__)
# Allow CORS for all domains for now, tighten in production
CORS(app, resources={r"/api/*": {"origins": "*"}})

DB_PATH = 'analytics.db'

def init_db():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute('''
        CREATE TABLE IF NOT EXISTS events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT,
            visitor_id TEXT,
            session_id TEXT,
            event_type TEXT,
            data TEXT,
            ip_address TEXT,
            country TEXT,
            city TEXT,
            user_agent TEXT
        )
    ''')
    conn.commit()
    conn.close()

init_db()

@app.route('/api/analytics', methods=['POST', 'OPTIONS'])
def collect_analytics():
    if request.method == 'OPTIONS':
        return _build_cors_preflight_response()

    try:
        # Handle both JSON body and beacon API (sometimes sends distinct types)
        if request.is_json:
            payload = request.get_json()
        else:
            # Fallback for sendBeacon with Blob
            payload = json.loads(request.data)
            
        visitor_ip = request.remote_addr
        user_agent = request.headers.get('User-Agent')
        
        # Extract location data if provided by frontend (or use server-side geoip in future)
        location = payload.get('location', {})
        
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute('''
            INSERT INTO events 
            (timestamp, visitor_id, session_id, event_type, data, ip_address, country, city, user_agent)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            payload.get('timestamp', datetime.datetime.now().isoformat()),
            payload.get('visitorId'),
            payload.get('sessionId'),
            payload.get('event'),
            json.dumps(payload.get('data', {})),
            visitor_ip,
            location.get('country', 'Unknown'),
            location.get('city', 'Unknown'),
            user_agent
        ))
        conn.commit()
        conn.close()
        
        return jsonify({"status": "success"}), 201
        
    except Exception as e:
        print(f"Error saving analytics: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/stats', methods=['GET'])
def get_stats():
    # Simple auth check (implement real auth in production!)
    auth_header = request.headers.get('Authorization')
    if auth_header != 'Bearer RECON_PRO_ADMIN_SECRET':
        return jsonify({"error": "Unauthorized"}), 401

    try:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        c = conn.cursor()
        
        # Get total visits (unique sessions)
        c.execute("SELECT COUNT(DISTINCT session_id) as count FROM events WHERE event_type = 'page_view'")
        total_visits = c.fetchone()['count']
        
        # Get total unique visitors
        c.execute("SELECT COUNT(DISTINCT visitor_id) as count FROM events")
        total_visitors = c.fetchone()['count']
        
        # Get events per type
        c.execute("SELECT event_type, COUNT(*) as count FROM events GROUP BY event_type")
        event_distribution = {row['event_type']: row['count'] for row in c.fetchall()}
        
        # Get recent events
        c.execute("SELECT * FROM events ORDER BY id DESC LIMIT 50")
        recent_events = [dict(row) for row in c.fetchall()]
        
        conn.close()
        
        return jsonify({
            "summary": {
                "total_visits": total_visits,
                "total_visitors": total_visitors,
                "event_distribution": event_distribution
            },
            "recent_events": recent_events
        })
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500

def _build_cors_preflight_response():
    response = make_response()
    response.headers.add("Access-Control-Allow-Origin", "*")
    response.headers.add("Access-Control-Allow-Headers", "*")
    response.headers.add("Access-Control-Allow-Methods", "*")
    return response

if __name__ == '__main__':
    # Run slightly differently for dev vs prod (gunicorn)
    app.run(host='0.0.0.0', port=5000)
