#!/bin/bash
# Relay para conectar iPhone (Admin) → Android emulador (Worker) via LAN
# Uso: ./scripts/lan-relay.sh

PORT=9847

# 1. Detectar IP local (ignora loopback y link-local)
IP=$(ifconfig | grep "inet " | grep -v 127.0.0.1 | grep -v "169.254" | awk '{print $2}' | head -1)
if [ -z "$IP" ]; then
  echo "❌ No se encontró IP local"
  exit 1
fi
echo "📡 IP local: $IP"

# 2. Limpiar forwards previos y crear nuevo
adb forward --remove tcp:$PORT 2>/dev/null
adb forward tcp:$PORT tcp:$PORT
echo "✅ adb forward tcp:$PORT → emulador Android"

# 3. Matar socat previo en ese puerto
pkill -f "socat.*TCP-LISTEN:$PORT" 2>/dev/null
sleep 0.5

# 4. Iniciar socat relay
socat TCP-LISTEN:$PORT,bind=$IP,reuseaddr,fork TCP:127.0.0.1:$PORT &
SOCAT_PID=$!
echo "✅ socat relay $IP:$PORT → 127.0.0.1:$PORT (PID $SOCAT_PID)"

echo ""
echo "📱 En tu iPhone pega esta IP: $IP"
echo "   (puerto $PORT se agrega automáticamente)"
echo ""
echo "Presiona Ctrl+C para detener el relay"

# Esperar y limpiar al salir
trap "kill $SOCAT_PID 2>/dev/null; adb forward --remove tcp:$PORT 2>/dev/null; echo ''; echo '🛑 Relay detenido'; exit 0" INT TERM
wait $SOCAT_PID
