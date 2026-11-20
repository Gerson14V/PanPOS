#!/usr/bin/env bash
trap 'kill $(jobs -p) 2>/dev/null' INT TERM EXIT

(cd ~/Proyectos/PanPOS/backend && exec php artisan serve --host=127.0.0.1 --port=8000) &
(cd ~/Proyectos/PanPOS/frontend && exec npm run dev) &

wait
