---
title: 记一次 Redis 连接问题排查
toc: true
type: 1
date: 2023-02-14 16:21:21
category:
- JAVA
tags:
- Redis
---

## 问题发现

客户端：业务应用使用 lettuce 客户端

服务端：Redis server 部署架构采用 1 主 + 1 从 + 3 哨兵

Redis 和业务应用部署在同一个 K8s 集群中，Redis Server 暴露了一个 redis-service，指向到 master 节点，业务应用通过 redis-service 连接 Redis。

某个时刻起，开始发现业务报错，稍加定位，发现是 Redis 访问出了问题，搜索业务应用日志，发现关键信息：

```java
org.springframework.data.redis.RedisSystemException: Error in execution; nested exception is io.lettuce.core.RedisCommandExecutionException: READONLY You can't write against a read only replica.
```

这是一个 Redis 访问的报错，看起来跟 Redis 的读写配置有关。

<!-- more -->

## 问题定位

首先排查下业务应用和 Redis 的连接情况

```
# netstat -ano | grep 6379
tcp        0      0 172.24.7.34:44602       10.96.113.219:6379      ESTABLISHED off (0.00/0/0)
```

其中 172.24.7.34 是业务 pod 的 ip，10.96.113.219 是 redis 的 K8s service ip，连接是 ESTABLISHED 状态，说明连接没有断。

继续排查 Redis 的 pod 是否正常：

```
redis-shareredis-0                           2/2     Running   0
redis-shareredis-1                           2/2     Running   0
redis-shareredis-sentinel-5f7458cd89-7dwpz   2/2     Running   0
redis-shareredis-sentinel-5f7458cd89-rrfz7   2/2     Running   0
redis-shareredis-sentinel-5f7458cd89-xzpmb   2/2     Running   0
```

无论是读写节点还是哨兵节点，都没有重启过。

既然报了只读节点的异常，索性看下 redis 节点的读写角色情况。

```
root@redis-shareredis-0:/data# redis-cli -h 172.24.1.95 -a xxxx role
1) "slave"
2) "172.24.1.96"
3) (integer) 6379
4) "connected"
5) (integer) 6942040980
root@redis-shareredis-0:/data# redis-cli -h 172.24.1.96 -a xxxx role
1) "master"
2) (integer) 6942173072
3) 1) 1) "172.24.1.95"
      2) "6379"
      3) "6942173072"
```

可以看到此时 redis-shareredis-0（172.24.1.95）是 slave 节点，redis-shareredis-1（172.24.1.96）是 master 节点。

排查到这里，猜测是业务 pod 实际通过 K8s service 连到了 slave 节点。进入 slave 确认这一信息，发现果然如此，并且 master 节点并没有检查到有该业务 pod 的连接

```
root@redis-shareredis-0:/data# netstat -ano | grep 172.24.7.34:44602
tcp        0      0 172.24.1.95:6379        172.24.7.34:44602       ESTABLISHED keepalive (24.09/0/0)
```

怀疑是某个时刻开始，master 和 slave 角色发生了互换，而主从切换过程中由于 pod 没有重启，长连接会一直保留着，此时即使 Redis service 的 endpoint 被修正，也不会影响到已有的连接。

![](https://kirito.iocoder.cn/image-20230214170127670.png)

为了验证上述猜想，着手排查 Redis server 节点和 sentinel 节点。

查看 Redis 哨兵日志：

```
1:X 03 Feb 2023 06:21:41.357 * +slave slave 172.24.1.96:6379 172.24.1.96 6379 @ mymaster 172.24.1.95 6379
1:X 14 Feb 2023 06:53:27.683 # +reset-master master mymaster 172.24.1.96 6379
1:X 14 Feb 2023 06:53:28.692 * +slave slave 172.24.1.95:6379 172.24.1.95 6379 @ mymaster 172.24.1.96 6379
1:X 14 Feb 2023 06:53:33.271 # +reset-master master mymaster 172.24.1.96 6379
```

可以看到在 2023/2/14 14:53 (时区+8)时发生了主从切换。

尝试排查主从切换的原因，进到 redis-0 查看日志：

```
1:M 14 Feb 2023 14:53:27.343 # Connection with replica 172.24.1.96:6379 lost.
1:S 14 Feb 2023 14:53:27.616 * Before turning into a replica, using my master parameters to synthesize a cached master: I may be able to synchronize with the new master with just a partial transfer.
1:S 14 Feb 2023 14:53:27.616 * REPLICAOF 172.24.1.96:6379 enabled (user request from 'id=1238496 addr=172.24.1.91:49388 fd=7 name= age=0 idle=0 flags=N db=0 sub=0 psub=0 multi=-1 qbuf=45 qbuf-free=32723 obl=0 oll=0 omem=0 events=r cmd=slaveof')
1:S 14 Feb 2023 14:53:27.646 * REPLICAOF would result into synchronization with the master we are already connected with. No operation performed.
1:S 14 Feb 2023 14:53:27.670 * REPLICAOF would result into synchronization with the master we are already connected with. No operation performed.
1:S 14 Feb 2023 14:53:28.076 * Connecting to MASTER 172.24.1.96:6379
1:S 14 Feb 2023 14:53:28.076 * MASTER <-> REPLICA sync started
1:S 14 Feb 2023 14:53:28.076 * Non blocking connect for SYNC fired the event.
1:S 14 Feb 2023 14:53:28.076 * Master replied to PING, replication can continue...
1:S 14 Feb 2023 14:53:28.077 * Trying a partial resynchronization (request 816c44412b9008e6969b2fef6401a6cef85fff87:6901666283).
1:S 14 Feb 2023 14:53:28.081 * Full resync from master: 86aa2f4759f73114594586e2e7d2cfbdd1ed2b69:6901664978
1:S 14 Feb 2023 14:53:28.081 * Discarding previously cached master state.
1:S 14 Feb 2023 14:53:28.140 * MASTER <-> REPLICA sync: receiving 1117094 bytes from master
1:S 14 Feb 2023 14:53:28.144 * MASTER <-> REPLICA sync: Flushing old data
1:S 14 Feb 2023 14:53:28.157 * MASTER <-> REPLICA sync: Loading DB in memory
1:S 14 Feb 2023 14:53:28.234 * MASTER <-> REPLICA sync: Finished with success
```

从日志分析是主从同步时出现了网络分区，导致哨兵进行重新选主，但为什么出现网络分区，就无从得知了，K8s 中两个 pod 之间的通信都能出现 Connection lost 的确挺诡异的。

到这里，问题的根源基本定位清楚了。

## 问题复盘

无论 Redis 的主从切换是故意的还是不小心，都应当被当做是一个常态，程序需要兼容这类场景。反映出两个问题：

- 问题一，Redis 使用了哨兵机制，程序应当首选通过哨兵连接 Redis
- 问题二，Lettuce 客户端没有自动断开错误的连接

那么改进思路自然是有两种，一是改用哨兵连接 Redis，二是替换掉 Lettuce。对于本文遇到的问题，方案一可能可以，但不能确保没有其他极端情况导致其他连接问题，所以我实际采用的是方案二，使用 Jedis 替换掉 Lettuce。

项目一开始采用 Lettuce，主要是因为 spring-boot-data-redis 默认采用了 Lettuce 的实现，尽管我一开始已经留意到搜索引擎中诸多关于 Lettuce 的问题，但实际测试发现，高版本 Lettuce 基本均已修复了这些问题，忽略了特殊场景下其可能存在的风险。简单对比下 Jedis 和 Lettuce:

- Lettuce：

  - Lettuce 客户端没有连接保活探测，错误连接存在连接池中会造成请求超时报错。
  - Lettuce 客户端未实现 testOnBorrow 等连接池检测方法，无法在使用连接之前进行连接校验。

- Jedis：

  - Jedis 客户端实现了 testOnBorrow、testWhileIdle、testOnReturn 等连接池校验配置。

    开启 testOnBorrow 在每次借用连接前都会进行连接校验，可靠性最高，但是会影响性能（每次 Redis 请求前会进行探测）。

  - testWhileIdle 可以在连接空闲时进行连接检测，合理配置阈值可以及时剔除连接池中的异常连接，防止使用异常连接造成业务报错。

  - 在空闲连接检测之前，连接出现问题，可能会造成使用该连接的业务报错，此处可以通过参数控制检测间隔（timeBetweenEvictionRunsMillis）。

因此，Jedis 客户端在面对连接异常，网络抖动等场景下的异常处理和检测能力明显强于 Lettuce，可靠性更强。

| 参数                          | **配置介绍**                                                 | **配置建议**                                                 |
| ----------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------ |
| maxTotal                      | 最大连接，单位：个                                           | 根据Web容器的Http线程数来进行配置，估算单个Http请求中可能会并行进行的Redis调用次数，例如：Tomcat中的Connector内的maxConnections配置为150，每个Http请求可能会并行执行2个Redis请求，在此之上进行部分预留，则建议配置至少为：150 x 2 + 100= 400**限制条件：**单个Redis实例的最大连接数。maxTotal和客户端节点数（CCE容器或业务VM数量）数值的乘积要小于单个Redis实例的最大连接数。例如：Redis主备实例配置maxClients为10000，单个客户端maxTotal配置为500，则最大客户端节点数量为20个。 |
| maxIdle                       | 最大空闲连接，单位：个                                       | 建议配置为maxTotal一致。                                     |
| minIdle                       | 最小空闲连接，单位：个                                       | 一般来说建议配置为maxTotal的X分之一，例如此处常规配置建议为：100。对于性能敏感的场景，防止经常连接数量抖动造成影响，也可以配置为与maxIdle一致，例如：400。 |
| maxWaitMillis                 | 最大获取连接等待时间，单位：毫秒                             | 获取连接时最大的连接池等待时间，根据单次业务最长容忍的失败时间减去执行命令的超时时间得到建议值。例如：Http最大容忍超时时间为15s，Redis请求的timeout设置为10s，则此处可以配置为5s。 |
| timeout                       | 命令执行超时时间，单位：毫秒                                 | 单次执行Redis命令最大可容忍的超时时间，根据业务程序的逻辑进行选择，一般来说处于对网络容错等考虑至少建议配置为210ms以上。特殊的探测逻辑或者环境异常检测等，可以适当调整达到秒级。 |
| minEvictableIdleTimeMillis    | 空闲连接逐出时间，大于该值的空闲连接一直未被使用则会被释放，单位：毫秒 | 如果希望系统不会经常对连接进行断链重建，此处可以配置一个较大值（xx分钟），或者此处配置为-1并且搭配空闲连接检测进行定期检测。 |
| timeBetweenEvictionRunsMillis | 空闲连接探测时间间隔，单位：毫秒                             | 根据系统的空闲连接数量进行估算，例如系统的空闲连接探测时间配置为30s，则代表每隔30s会对连接进行探测，如果30s内发生异常的连接，经过探测后会进行连接排除。根据连接数的多少进行配置，如果连接数太大，配置时间太短，会造成请求资源浪费。对于几百级别的连接，常规来说建议配置为30s，可以根据系统需要进行动态调整。 |
| testOnBorrow                  | 向资源池借用连接时是否做连接有效性检测（ping），检测到的无效连接将会被移除。 | 对于业务连接极端敏感的，并且性能可以接受的情况下，可以配置为True，一般来说建议配置为False，启用连接空闲检测。 |
| testWhileIdle                 | 是否在空闲资源监测时通过ping命令监测连接有效性，无效连接将被销毁。 | True                                                         |
| testOnReturn                  | 向资源池归还连接时是否做连接有效性检测（ping），检测到无效连接将会被移除。 | False                                                        |
| maxAttempts                   | 在JedisCluster模式下，您可以配置maxAttempts参数来定义失败时的重试次数。 | 建议配置3-5之间，默认配置为5。根据业务接口最大超时时间和单次请求的timeout综合配置，最大配置不建议超过10，否则会造成单次请求处理时间过长，接口请求阻塞。 |

再次回到本次案例，如果使用了 Jedis，并且配置了合理的连接池策略，可能仍然会存在问题，因为 Jedis 底层检测连接是否可用，使用的是 ping 命令，当连接到只读节点，ping 命令仍然可以工作，所以实际上连接检查机制并不能解决本案例的问题。

但 Jedis 提供了一个 minEvictableIdleTimeMillis 参数，该参数表示一个连接至少停留在 idle 状态的最短时间，然后才能被 idle object evitor 扫描并驱逐，该参数会受到 minIdle 的影响，驱逐到 minIdle 的数量。也就意味着：默认配置 minEvictableIdleTimeMillis=60s，minIdle=0 下，连接在空闲时间达到 60s 时，将会被释放。由于实际的业务场景 Redis 读写空闲达到 60s 的场景是很常见的，所以该方案勉强可以达到在主从切换之后，在较短时间内恢复。但如果 minIdle > 0，这些连接依旧会有问题。而 Lettuce 默认配置下，连接会一直存在。

出于一些不可描述的原因，我无法将应用连接 Redis 的模式切换成哨兵模式，所以最终采取了切换到 Jedis 客户端，并且配置 minIdle=0、minEvictableIdleTimeMillis=60s 的方案。

## 问题总结

当使用域名/K8s Service 连接 Redis 集群时，需要考虑主从切换时可能存在的问题。Redis 通常使用长连接通信，主从切换时如果连接不断开，会导致无法进行写入操作。可以在客户端、服务端两个层面规避这一问题，以下是一些行之有效的方案：

- 客户端连接哨兵集群，哨兵会感知到主从切换，并推送给客户端这一变化
- 客户端配置 minIdle=0，及时断开空闲的连接，可以一定程度规避连接已经不可用但健康检测又检查不出来的场景。（即本文的场景）
- 服务端主从切换时断开所有已有的连接，依靠客户端的健康检测以及重连等机制，确保连接到正确的节点。

Redis 客户端推荐使用 Jedis 客户端，其在面对连接异常，网络抖动等场景下的异常处理和检测能力明显强于 Lettuce。

