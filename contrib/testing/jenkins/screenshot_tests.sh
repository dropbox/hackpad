#! /bin/bash
HIPCHAT_ROOM="hackpad"
HIPCHAT_START_MESSAGE="Starting screenshot tests. (<a href='${BUILD_URL}stop'>click here to stop me</a>)"

DESTINATION_BRANCH=master

echo "Starting screenshot tests..."
cd ../Hackpad\ Unit\ Tests/contrib/testing/
./run.py --nogui --nocolors

# copy the diff files into the Hackpad Screenshot Tests workspace in order for the
# image gallery plugin to see the artifacts
cd ~/workspace/Hackpad\ Screenshot\ Tests/
rm -rf broken/*.png
# Check if files exist since the copy error would cause the build script to fail (even though no diffs means PASS)
if ls ../Hackpad\ Unit\ Tests/contrib/testing/screenshots/diffs/*/*.png > /dev/null 2>&1; then
  cp ../Hackpad\ Unit\ Tests/contrib/testing/screenshots/diffs/*/*.png broken/
fi
