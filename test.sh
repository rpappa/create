# Exit if any command fails
set -e

# If testProjects directory doesn't exist, create it

if [ ! -d "testProjects" ]; then
  mkdir testProjects
fi

cd testProjects

TIMESTAMP=$(date +%s)
PROJECT_NAME="testProject$TIMESTAMP"

# Create a new project
mkdir $PROJECT_NAME
cd $PROJECT_NAME

echo "Creating a new project [$PROJECT_NAME]"

node ../../src/cli.js $@

# Prompt if we want to clean up
read -p "Do you want to clean up? (y/n) " -n 1 -r

if [[ $REPLY =~ ^[Yy]$ ]]; then
  # Remove the project directory
  cd ..
  rm -rf $PROJECT_NAME

  cd ..
  # If testProjects directory is empty, remove it
  if [ -z "$(ls -A testProjects)" ]; then
    rm -rf testProjects
  fi
fi