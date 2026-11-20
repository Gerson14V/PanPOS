<?php

$uri = urldecode(parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH) ?? '/');
$publicPath = realpath(__DIR__ . DIRECTORY_SEPARATOR . 'public');

if ($publicPath !== false && $uri !== '/') {
    $requested = realpath($publicPath . DIRECTORY_SEPARATOR . ltrim($uri, '/\\'));
    if ($requested !== false && str_starts_with($requested, $publicPath . DIRECTORY_SEPARATOR) && is_file($requested)) {
        return false;
    }
}

require_once __DIR__ . DIRECTORY_SEPARATOR . 'public' . DIRECTORY_SEPARATOR . 'index.php';
