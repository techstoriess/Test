<?php
// AI API Configuration
// Set these via environment variables or replace placeholders before use

define('CLAUDE_API_KEY',  getenv('CLAUDE_API_KEY')  ?: '');
define('CLAUDE_API_URL',  'https://api.anthropic.com/v1/messages');
define('CLAUDE_MODEL',    'claude-sonnet-4-6');

define('OPENAI_API_KEY',  getenv('OPENAI_API_KEY')  ?: '');
define('OPENAI_API_URL',  'https://api.openai.com/v1/chat/completions');
define('OPENAI_MODEL',    'gpt-4o');

define('GEMINI_API_KEY',  getenv('GEMINI_API_KEY')  ?: '');
define('GEMINI_API_URL',  'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent');

define('MAX_TOKENS', 4096);
define('REQUEST_TIMEOUT', 60);
