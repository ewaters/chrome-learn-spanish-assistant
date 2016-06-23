# Start FreeLing

## Check what containers are running:

eval $(docker-machine env)
docker ps

## If it's not running, start it:

docker run -d -p 12345:12345 ericnwaters/freeling-head:v2 analyze -f es.cfg --outlv tagged --output json --server --port 12345

## If the image doesn't exist, create it:

cd ~/code/go-freeling/analyzer/
docker build -t ericnwaters/freeling-head:v3 .

## Or, to update from HEAD:

docker build --no-cache -t ericnwaters/freeling-head:v3 .

# Start FreeLing HTTP proxy

cd ~/code/go-freeling/proxy
go run *.go --fl_addr=$(docker-machine ip):12345
