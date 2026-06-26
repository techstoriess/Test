<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

require_once __DIR__ . '/../includes/ai_clients.php';

$raw  = file_get_contents('php://input');
$body = json_decode($raw, true);

if (json_last_error() !== JSON_ERROR_NONE) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid JSON body']);
    exit;
}

$prompt  = trim($body['prompt']   ?? '');
$task    = trim($body['task']     ?? 'optimize');
$models  = $body['models']        ?? ['claude'];
$lang    = trim($body['language'] ?? 'auto');
$keys    = $body['keys']          ?? [];          // optional client-supplied keys

$allowed_tasks  = ['optimize', 'review', 'fix', 'refactor', 'document'];
$allowed_models = ['claude', 'openai', 'gemini'];

if (empty($prompt)) {
    http_response_code(400);
    echo json_encode(['error' => 'Prompt cannot be empty.']);
    exit;
}

if (mb_strlen($prompt) > 32000) {
    http_response_code(400);
    echo json_encode(['error' => 'Prompt exceeds 32,000-character limit.']);
    exit;
}

if (!in_array($task, $allowed_tasks, true)) { $task = 'optimize'; }

$models = array_values(array_filter($models, fn($m) => in_array($m, $allowed_models, true)));
if (empty($models)) {
    http_response_code(400);
    echo json_encode(['error' => 'Select at least one AI model.']);
    exit;
}

// Allow client-supplied keys to override env/config (validated against basic format)
if (!empty($keys['claude']) && str_starts_with($keys['claude'], 'sk-ant-')) {
    define('OVERRIDE_CLAUDE_KEY', $keys['claude']);
}
if (!empty($keys['openai']) && str_starts_with($keys['openai'], 'sk-')) {
    define('OVERRIDE_OPENAI_KEY', $keys['openai']);
}
if (!empty($keys['gemini']) && str_starts_with($keys['gemini'], 'AIza')) {
    define('OVERRIDE_GEMINI_KEY', $keys['gemini']);
}

$full_prompt = ($lang !== 'auto')
    ? "Language: $lang\n\n$prompt"
    : $prompt;

$results = [];

foreach ($models as $model) {
    $start = microtime(true);

    $res = match ($model) {
        'claude' => call_claude($full_prompt, $task),
        'openai' => call_openai($full_prompt, $task),
        'gemini' => call_gemini($full_prompt, $task),
    };

    $res['time_ms'] = (int) round((microtime(true) - $start) * 1000);
    $results[$model] = $res;
}

echo json_encode(['results' => $results]);
