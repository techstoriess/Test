<?php
require_once __DIR__ . '/config.php';

function build_system_prompt(string $task): string {
    $tasks = [
        'optimize'  => 'You are an expert code optimizer. Analyze the provided code and return an optimized version with improvements for performance, readability, and best practices. Explain key changes made.',
        'review'    => 'You are a senior code reviewer. Perform a thorough code review identifying bugs, security issues, performance bottlenecks, and style violations. Be specific and actionable.',
        'fix'       => 'You are a debugging expert. Identify and fix all bugs, errors, and issues in the provided code. Explain each fix clearly.',
        'refactor'  => 'You are a software architect. Refactor the provided code to improve structure, maintainability, and adherence to SOLID principles. Provide the refactored code with explanations.',
        'document'  => 'You are a technical writer and developer. Add comprehensive documentation, comments, and docstrings to the provided code. Preserve all logic while making it well-documented.',
    ];
    return $tasks[$task] ?? $tasks['optimize'];
}

function call_claude(string $prompt, string $task): array {
    $key = defined('OVERRIDE_CLAUDE_KEY') ? OVERRIDE_CLAUDE_KEY : CLAUDE_API_KEY;
    if (empty($key)) {
        return ['error' => 'Claude API key not configured. Add it via the API Keys modal or set CLAUDE_API_KEY env var.'];
    }

    $system = build_system_prompt($task);
    $payload = json_encode([
        'model'      => CLAUDE_MODEL,
        'max_tokens' => MAX_TOKENS,
        'system'     => $system,
        'messages'   => [['role' => 'user', 'content' => $prompt]],
    ]);

    $ch = curl_init(CLAUDE_API_URL);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => $payload,
        CURLOPT_TIMEOUT        => REQUEST_TIMEOUT,
        CURLOPT_HTTPHEADER     => [
            'Content-Type: application/json',
            'x-api-key: ' . $key,
            'anthropic-version: 2023-06-01',
        ],
    ]);

    $response = curl_exec($ch);
    $http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curl_error = curl_error($ch);
    curl_close($ch);

    if ($curl_error) {
        return ['error' => 'Connection error: ' . $curl_error];
    }

    $data = json_decode($response, true);

    if ($http_code !== 200) {
        return ['error' => $data['error']['message'] ?? "HTTP $http_code error"];
    }

    return ['result' => $data['content'][0]['text'] ?? 'No response'];
}

function call_openai(string $prompt, string $task): array {
    $key = defined('OVERRIDE_OPENAI_KEY') ? OVERRIDE_OPENAI_KEY : OPENAI_API_KEY;
    if (empty($key)) {
        return ['error' => 'OpenAI API key not configured. Add it via the API Keys modal or set OPENAI_API_KEY env var.'];
    }

    $system = build_system_prompt($task);
    $payload = json_encode([
        'model'      => OPENAI_MODEL,
        'max_tokens' => MAX_TOKENS,
        'messages'   => [
            ['role' => 'system', 'content' => $system],
            ['role' => 'user',   'content' => $prompt],
        ],
    ]);

    $ch = curl_init(OPENAI_API_URL);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => $payload,
        CURLOPT_TIMEOUT        => REQUEST_TIMEOUT,
        CURLOPT_HTTPHEADER     => [
            'Content-Type: application/json',
            'Authorization: Bearer ' . $key,
        ],
    ]);

    $response = curl_exec($ch);
    $http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curl_error = curl_error($ch);
    curl_close($ch);

    if ($curl_error) {
        return ['error' => 'Connection error: ' . $curl_error];
    }

    $data = json_decode($response, true);

    if ($http_code !== 200) {
        return ['error' => $data['error']['message'] ?? "HTTP $http_code error"];
    }

    return ['result' => $data['choices'][0]['message']['content'] ?? 'No response'];
}

function call_gemini(string $prompt, string $task): array {
    $key = defined('OVERRIDE_GEMINI_KEY') ? OVERRIDE_GEMINI_KEY : GEMINI_API_KEY;
    if (empty($key)) {
        return ['error' => 'Gemini API key not configured. Add it via the API Keys modal or set GEMINI_API_KEY env var.'];
    }

    $system = build_system_prompt($task);
    $payload = json_encode([
        'contents' => [[
            'parts' => [[
                'text' => $system . "\n\n" . $prompt,
            ]],
        ]],
        'generationConfig' => [
            'maxOutputTokens' => MAX_TOKENS,
            'temperature'     => 0.2,
        ],
    ]);

    $url = GEMINI_API_URL . '?key=' . $key;
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => $payload,
        CURLOPT_TIMEOUT        => REQUEST_TIMEOUT,
        CURLOPT_HTTPHEADER     => ['Content-Type: application/json'],
    ]);

    $response = curl_exec($ch);
    $http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curl_error = curl_error($ch);
    curl_close($ch);

    if ($curl_error) {
        return ['error' => 'Connection error: ' . $curl_error];
    }

    $data = json_decode($response, true);

    if ($http_code !== 200) {
        $msg = $data['error']['message'] ?? "HTTP $http_code error";
        return ['error' => $msg];
    }

    $text = $data['candidates'][0]['content']['parts'][0]['text'] ?? 'No response';
    return ['result' => $text];
}
