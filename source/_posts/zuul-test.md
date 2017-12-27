---
title: Zuul性能测试
date: 2017-04-08 15:27:52
tags: 
- Spring Cloud Zuul
categories: 
- Spring Cloud
---



环境准备
----
采用三台阿里云服务器作为测试
10.19.52.8 部署网关应用-gateway
10.19.52.9, 10.19.52.10 部署用于测试的业务系统
![这里写图片描述](http://img.blog.csdn.net/20170408122814192?watermark/2/text/aHR0cDovL2Jsb2cuY3Nkbi5uZXQvdTAxMzgxNTU0Ng==/font/5a6L5L2T/fontsize/400/fill/I0JBQkFCMA==/dissolve/70/gravity/SouthEast)

压测工具准备
------
选用ab作为压力测试的工具，为了方便起见，直接将ab工具安装在10.19.52.8这台机
测试命令如下：
```shell
ab -n 10000 -c 100 http://10.19.52.8:8080/hello/testOK?access_token=e0345712-c30d-4bf8-ae61-8cae1ec38c52
```
其中－n表示请求数，－c表示并发数,上面一条命令也就意味着，100个用户并发对`http://10.19.52.8/hello/testOK`累计发送了10000次请求。

服务器,网关配置
--------
由于我们使用的tomcat容器，关于tomcat的一点知识总结如下：

<!-- more -->

> Tomcat的最大并发数是可以配置的，实际运用中，最大并发数与硬件性能和CPU数量都有很大关系的。更好的硬件，更多的处理器都会使Tomcat支持更多的并发。
> ​	
> Tomcat 默认的HTTP实现是采用阻塞式的Socket通信，每个请求都需要创建一个线程处理，当一个进程有500个线程在跑的话，那性能已经是很低很低了。Tomcat默认配置的最大请求数是150，也就是说同时支持150个并发。具体能承载多少并发，需要看硬件的配置，CPU越多性能越高，分配给JVM的内存越多性能也就越高，但也会加重GC的负担。当某个应用拥有 250个以上并发的时候，应考虑应用服务器的集群。操作系统对于进程中的线程数有一定的限制：
>  Windows 每个进程中的线程数不允许超过 2000
> Linux 每个进程中的线程数不允许超过 1000
> 在Java中每开启一个线程需要耗用1MB的JVM内存空间用于作为线程栈之用，此处也应考虑。

 

所以我们修改配置tomcat的默认配置，如下：
```yaml
server:
  tomcat:
    accept-count: 1000 
    max-threads: 1000
    max-connections: 2000
```
无论是网关应用，还是用于测试的业务系统的tomcat，我们都需要如上配置，否则会引起木桶效应，整个调用流程会受到配置最差的应用的干扰。
zuul内部路由可以理解为使用一个线程池去发送路由请求，所以我们也需要扩大这个线程池的容量，配置如下：
```yaml
zuul:
  host:
    max-per-route-connections: 1000
    max-total-connections: 1000
```

监控工具
----

为了确保上述配置真正起作用，我们使用Java VisualVM这个工具监控这几台服务器上部署的tomcat的线程以及内存使用情况。
启动脚本加上如下参数，之后通过工具连接2099端口即可监控
```shell
-Dcom.sun.management.jmxremote.port=2099 -Dcom.sun.management.jmxremote.ssl=false -Dcom.sun.management.jmxremote.authenticate=false -Djava.rmi.server.hostname=10.19.52.8
```

开始测试
----

 - 测试一
  1.通过访问网关，由网关转发，应用端接口延迟200ms后返回一个字符串，模拟真实接口的业务处理延迟
  2.300个线程并发请求，共计100000 次
```shell
ab -n 100000 -c 300 http://10.19.52.8:8080/hello/testOK?access_token=e0345712-c30d-4bf8-ae61-8cae1ec38c52
```

```
Document Path:          /hello/testOK?access_token=e0345712-c30d-4bf8-ae61-8cae1ec38c52
Document Length:        2 bytes

Concurrency Level:      300
Time taken for tests:   151.026 seconds
Complete requests:      100000
Failed requests:        0
Write errors:           0
Total transferred:      42200844 bytes
HTML transferred:       200004 bytes
**Requests per second:    662.14 [#/sec] (mean)**
Time per request:       453.078 [ms] (mean)
Time per request:       1.510 [ms] (mean, across all concurrent requests)
Transfer rate:          272.88 [Kbytes/sec] received

Connection Times (ms)
              min  mean[+/-sd] median   max
Connect:        0    5   7.0      2      98
Processing:   206  447 478.7    230    3171
Waiting:      197  445 478.7    227    3165
Total:        206  451 478.8    236    3177

Percentage of the requests served within a certain time (ms)
  50%    236
  66%    250
  75%    273
  80%    322
  90%   1408
  95%   1506
  98%   1684
  99%   1764
 100%   3177 (longest request)

```
测试二：
1.直接访问应用，应用端接口延迟200ms后返回一个字符串，模拟真实接口的业务处理延迟
2.300个线程并发请求，共计100000 次

```
ab -n 100000 -c 300 http://10.19.52.9:9091/testOK
```

```
Server Hostname:        10.19.52.9
Server Port:            9091

Document Path:          /testOK
Document Length:        2 bytes

Concurrency Level:      300
Time taken for tests:   69.003 seconds
Complete requests:      100000
Failed requests:        0
Write errors:           0
Total transferred:      13400000 bytes
HTML transferred:       200000 bytes
**Requests per second:    1449.21 [#/sec] (mean)**
Time per request:       207.009 [ms] (mean)
Time per request:       0.690 [ms] (mean, across all concurrent requests)
Transfer rate:          189.64 [Kbytes/sec] received

Connection Times (ms)
              min  mean[+/-sd] median   max
Connect:        0    0   0.8      0      10
Processing:   200  206   7.7    202     286
Waiting:      200  205   7.7    202     286
Total:        201  206   7.9    203     295

Percentage of the requests served within a certain time (ms)
  50%    203
  66%    205
  75%    207
  80%    209
  90%    215
  95%    220
  98%    229
  99%    240
 100%    295 (longest request)
```
经过网关路由之后的性能下降是不可避免的，在测试过程中，查看监控端的线程变化，如下图：

![这里写图片描述](http://img.blog.csdn.net/20170408145703703?watermark/2/text/aHR0cDovL2Jsb2cuY3Nkbi5uZXQvdTAxMzgxNTU0Ng==/font/5a6L5L2T/fontsize/400/fill/I0JBQkFCMA==/dissolve/70/gravity/SouthEast)

我们的配置的确产生了作用。

我们再来分析一下上面测试结果的一个重要指标：Requests per second，我们的网关经过了鉴权之后，性能仍然可以达到600+每秒的响应，是完全可以接受的，峰值时内存情况，使用top指令，如下所示：![这里写图片描述](http://img.blog.csdn.net/20170408150216769?watermark/2/text/aHR0cDovL2Jsb2cuY3Nkbi5uZXQvdTAxMzgxNTU0Ng==/font/5a6L5L2T/fontsize/400/fill/I0JBQkFCMA==/dissolve/70/gravity/SouthEast)
ab测试命令也占用了一定的cpu使用率，总应用接近70%的cpu使用率，这估计也是单个tomcat实例的瓶颈了。因为我们的应用服务器会单独部署网关，并且可以在多个服务器上部署多个实例，所以这个结果可以接受。

为了避免单次响应带来的偶然因素，我们重复进行测试一（更改为10000次请求，并发量200），看看Requests per second的变化。

```
1. 799.45
2. 818.86
3. 838.67
4. 833.90
5. 973.65
```

总结
--
有一些其他的数据没有整理到博客中，但是也顺便把结论写一下。

这次的测试有几个注意点：

  1. 是在应用服务器端模拟200ms的延时，因为实际请求不可能不伴随着耗时的业务操作，实际发现对ab的测试影响还是较大的，毕竟线程阻塞着，不延迟时request per second能达到2000，加了200ms延迟之后下降到1000+。
  2. 模拟总请求数和线程数的变化会引起QPS/TPS的抖动，即使是在多核CPU的承受范围之内，也并不是说线程越多，QPS/TPS就越高，因为启动线程的开销，以及线程上下文切换的耗时，开辟线程带来的内存损耗都会影响性能。钱总说单个tomcat实例的并发度理论值200就可以接受了，经过参数调优后的tomcat使用zuul做网关能达到如上的测试结果，完全可以投入生产环境使用了。而tomcat默认的150线程，如果使用200的并发度测试就显然是“不公平的”。
  3. 测试注意点有几个，例如ab部署在了api-gateway本机会影响性能，tomcat参数以及zuul参数应当尽可能放开，不让其默认配置影响测试。

本文还有些遗漏的数据，后续会补上...




