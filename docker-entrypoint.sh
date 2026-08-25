#!/bin/sh
# Start both Python and Node services in the same container

echo "Starting EnergyOps services..."

# Start Python service in the background
echo "Starting Python statistics service on port 8000..."
cd /app/python-service
python main.py &
PYTHON_PID=$!

# Give Python service a moment to start
sleep 2

# Start Node backend in the foreground
echo "Starting Node backend on port 3000..."
cd /app/backend
exec node server.js &
NODE_PID=$!

# Wait for both processes
wait $PYTHON_PID $NODE_PID
