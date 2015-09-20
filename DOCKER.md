How to develop Hackpad under Docker
===================================

If you'd like to develop Hackpad on Docker, these instructions are for you.

This will let you edit this repository and see your changes reflected in the docker image. 

Getting it running
-------------------

1. Obviously, if you haven't already, you'll need to install [Docker](https://docs.docker.com/installation/).

2. Build the image. From the root of this repo, run:

		docker build -t hackpad .

3. Run the container. Docker doesn't let you automatically mount a directory on your host machine in the container, so you'll need to specify by hand. 

	Replace /path/to/this/repo below with the path to the current repository. Leave the other path alone. 

		docker run -d -p 9000:9000 -v /path/to/this/repo:/etc/hackpad/src hackpad

	This will build hackpad, run schema migrations, and then start the server. It may take a few minutes. If you want to see what's going on, do:

		docker logs -f [container name]

4. Fix networking (one time only). If you're on OS X or Windows, you'll need to set up port forwarding to have Hackpad work properly. Linux folk can skip this.

	1. Open VirtualBox

	2. Select the `default` image and click Settings

	3. Go to Network -> Adapter 1 -> Port forwarding

	4. Create a custom rule like so:

		* Host IP: 127.0.0.1
		* Host Port: 9000
		* Guest IP: blank
		* Guest Port: 9000

	You should only have to do this once.

	At this point you should be able to open http://localhost:9000 in a browser and see the Hackpad page.

5. Create a password for the admin account.

	As part of the Docker setup, Hackpad is configured with 'admin@localhost.info' as a admin account, but you'll need to create a password to log in. 

	To do that: 

	1. Open http://localhost:9000 and click Log In

	2. Create an account with 'admin@localhost.info' and any password you like.

	3. From the command line, run:

		1. Find the name of your running container by running `docker ps`. Note the name. 

		2. Run this query and find the token:

				docker exec -it [container name] mysql -D hackpad -e 'select * from email_signup;'

		3. Load this in a browser: http://localhost:9000/ep/account/validate-email?email=admin%40localhost.info&token=TOKEN


You're all set!  You should be able to edit the Hackpad source code and the docker container will track those changes.

