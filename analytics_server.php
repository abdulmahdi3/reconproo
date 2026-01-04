<?php
/**
 * RECON PRO - PHP Analytics Backend
 * Compatible with Shared Hosting (Hostinger, cPanel, etc.)
 * Drop this file into the same directory as your index.html
 */

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Content-Type: application/json');

// Database Configuration (SQLite)
$dbFile = __DIR__ . '/analytics.db';

// Initialize Database if not exists
if (!file_exists($dbFile)) {
    try {
        $db = new PDO('sqlite:' . $dbFile);
        $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $db->exec("CREATE TABLE IF NOT EXISTS events (
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
        )");
        chmod($dbFile, 0664); // Ensure writable
    } catch (PDOException $e) {
        http_response_code(500);
        die(json_encode(['status' => 'error', 'message' => 'Database initialization failed: ' . $e->getMessage()]));
    }
}

// Handle Requests
$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'OPTIONS') {
    http_response_code(200);
    exit();
}

if ($method === 'POST') {
    // Collect Data
    $input = file_get_contents('php://input');
    $payload = json_decode($input, true);

    if (!$payload) {
        http_response_code(400);
        die(json_encode(['status' => 'error', 'message' => 'Invalid JSON']));
    }

    $ip = $_SERVER['REMOTE_ADDR'];
    $ua = $_SERVER['HTTP_USER_AGENT'] ?? 'Unknown';
    $location = $payload['location'] ?? [];

    try {
        $db = new PDO('sqlite:' . $dbFile);
        $stmt = $db->prepare("INSERT INTO events (timestamp, visitor_id, session_id, event_type, data, ip_address, country, city, user_agent) VALUES (:ts, :vid, :sid, :evt, :dat, :ip, :cnt, :cty, :ua)");

        $stmt->execute([
            ':ts' => $payload['timestamp'] ?? date('c'),
            ':vid' => $payload['visitorId'] ?? null,
            ':sid' => $payload['sessionId'] ?? null,
            ':evt' => $payload['event'] ?? 'unknown',
            ':dat' => json_encode($payload['data'] ?? []),
            ':ip' => $ip,
            ':cnt' => $location['country'] ?? 'Unknown',
            ':cty' => $location['city'] ?? 'Unknown',
            ':ua' => $ua
        ]);

        http_response_code(201);
        echo json_encode(['status' => 'success']);
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(['status' => 'error', 'message' => 'Write failed']);
    }
    exit();
}

if ($method === 'GET') {
    // Admin Stats Endpoint
    // SECURITY: Change this token!
    $secret = 'afsdlj24356wneiv346wpeomafpll2092342lkajsdf';
    $headers = getallheaders();
    $auth = $headers['Authorization'] ?? '';

    if ($auth !== "Bearer $secret") {
        http_response_code(401);
        die(json_encode(['error' => 'Unauthorized']));
    }

    try {
        $db = new PDO('sqlite:' . $dbFile);

        $stmt = $db->query("SELECT COUNT(DISTINCT session_id) as count FROM events WHERE event_type = 'page_view'");
        $totalVisits = $stmt->fetch(PDO::FETCH_ASSOC)['count'];

        // Total Visitors
        $stmt = $db->query("SELECT COUNT(DISTINCT visitor_id) as count FROM events");
        $totalVisitors = $stmt->fetch(PDO::FETCH_ASSOC)['count'];

        // Event Distribution
        $stmt = $db->query("SELECT event_type, COUNT(*) as count FROM events GROUP BY event_type");
        $dist = $stmt->fetchAll(PDO::FETCH_KEY_PAIR);

        // Recent Events
        $stmt = $db->query("SELECT * FROM events ORDER BY id DESC LIMIT 50");
        $recent = $stmt->fetchAll(PDO::FETCH_ASSOC);

        echo json_encode([
            'summary' => [
                'total_visits' => $totalVisits,
                'total_visitors' => $totalVisitors,
                'event_distribution' => $dist
            ],
            'recent_events' => $recent
        ]);

    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(['error' => $e->getMessage()]);
    }
    exit();
}
?>