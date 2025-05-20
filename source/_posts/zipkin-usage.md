---
title: 使用 zipkin 做分布式链路监控
date: 2017-06-12 02:51:51
tags: 
- Zipkin
categories: 
- 技术杂谈
toc: true
---

# 介绍   
* Zipkin 为一个分布式的调用链跟踪系统 (distributed tracing system) , 设计来源于 [google dapper paper](http://research.google.com/pubs/pub36356.html)
*  [官方网站](http://zipkin.io/)

# 快速入门

 - 安装方式一：使用 zipkin 官方提供的 jar 启动服务
    zipkin 官方提供了一个现成的使用 springboot 写的 zipkin 服务端，客户端的链路监控报告可以通过多种方式（下文会讲解具体的方式）向服务端发送报告。
* 系统需要安装 java8 
* [下载地址](https://search.maven.org/remote_content?g=io.zipkin.java&a=zipkin-server&v=LATEST&c=exec)

  配置详解
  ![存储方式](http://img.blog.csdn.net/20170612021516652?watermark/2/text/aHR0cDovL2Jsb2cuY3Nkbi5uZXQvdTAxMzgxNTU0Ng==/font/5a6L5L2T/fontsize/400/fill/I0JBQkFCMA==/dissolve/70/gravity/SouthEast)
  查看源码可知其有 4 种持久化方式，本文选择使用最熟悉的 mysql 持久化链路调用信息。

首先建立数据库：
默认情况下 zipkin 运行时数据保存在内存中，重启数据会丢失
[数据库脚本下载](https://github.com/openzipkin/zipkin/blob/master/zipkin-storage/mysql/src/main/resources/mysql.sql)

查看与 mysql storage 相关的配置
```java
@ConfigurationProperties("zipkin.storage.mysql")
public class ZipkinMySQLStorageProperties implements Serializable { // for Spark jobs
  private static final long serialVersionUID = 0L;

  private String host = "localhost";
  private int port = 3306;
  private String username;
  private String password;
  private String db = "zipkin";
  private int maxActive = 10;
  private boolean useSsl;
	...
}
```
所以，我们使用 mysql 作为持久化策略，启动服务端的脚本也就有了
```shell
java -server -jar zipkin-server-1.26.0-exec.jar --zipkin.storage.type=mysql --zipkin.storage.mysql.host=localhost --zipkin.storage.mysql.port=3306 --zipkin.storage.mysql.username=root --zipkin.storage.mysql.password=root --zipkin.storage.mysql.db=zipkin
```

- 安装方式二
  springcloud 官方按照传输方式分成了三种启动服务端的方式：Sleuth with Zipkin via HTTP，Sleuth with Zipkin via Spring Cloud Stream，Spring Cloud Sleuth Stream Zipkin Collector。只需要添加相应的依赖，之后配置相应的注解，如 `@EnableZipkinStreamServer` 即可。具体配置参考 [Spring Cloud 官方文档](http://cloud.spring.io/spring-cloud-static/spring-cloud-sleuth/1.2.1.RELEASE/#_adding_to_the_project)

项目中，我们使用第一种作为服务端的启动方式，使用 mysql 作为持久化方案

<!-- more -->

# 被监控项目配置

application.yml

```yaml
spring:
  zipkin:
	#服务端地址
    base-url: http://10.19.52.11:9411
    #本项目服务名
    service:
      name: ${spring.application.name}
  sleuth:
	#监控开关
    enabled: true
    #采样率
    sampler:
      percentage: 1
```
springboot 对 zipkin 的自动配置可以使得所有 RequestMapping 匹配到的 endpoints 得到监控，以及强化了 restTemplate，对其加了一层拦截器，使得由他发起的 http 请求也同样被监控。

# motan rpc 调用监控
Motan 通过 filter 的 SPI 扩展机制支持 OpenTracing，可以支持任何实现了 OpenTracing 标准的 trace 实现。使用 OpenTracing 需要以下步骤。

1. 引入 filter-opentracing 扩展
```xml
<dependency>
     <groupId>com.weibo</groupId>
     <artifactId>filter-opentracing</artifactId>
     <version>release</version>
</dependency>
```

2. 如果第三方 trace 工具声明了 io.opentracing.Tracer 的 SPI 扩展，直接引入第三方 trace 的 jar 包即可。如果第三方没有声明，则转第三步。

3. 自定义一个 TracerFactory 实现 TracerFactory 接口，通过 getTracer() 来获取不同 tracer 实现。设置 OpenTracingContext 的 tracerFactory 为自定义的 TracerFactory 即可。


项目中的具体配置 MotanConfig.java：
```java
@Bean(name = "motanServerBasicConfig")
    public BasicServiceConfigBean baseServiceConfig(@Value("${spring.sleuth.enabled:false}") Boolean tracing
    ) {
        BasicServiceConfigBean config = new BasicServiceConfigBean();
        ...
        if(tracing){
            config.setFilter("sleuth-tracing");
        }
        ...
        return config;
    }


@Bean
SleuthTracingContext sleuthTracingContext(@Autowired(required = false)  org.springframework.cloud.sleuth.Tracer tracer){
        SleuthTracingContext context = new SleuthTracingContext();
        context.setTracerFactory(new SleuthTracerFactory() {
            @Override
            public org.springframework.cloud.sleuth.Tracer getTracer() {
                return tracer;
            }
        });

        return context;
    }
```

# 数据查询
具体的服务就不列出来了，为了演示依赖关系，service1 使用 restTemplate 调用了 service2,service2 调用了 service3，service4。
还有一些现成的 motan 调用

- **find a trace**
  当应用正常启动后，可以通过 http://10.19.52.11:9411 查看管理端
  ![这里写图片描述](http://img.blog.csdn.net/20170612033405237?watermark/2/text/aHR0cDovL2Jsb2cuY3Nkbi5uZXQvdTAxMzgxNTU0Ng==/font/5a6L5L2T/fontsize/400/fill/I0JBQkFCMA==/dissolve/70/gravity/SouthEast)
  项目已经成功被监控

- **Dependencies**

motan 依赖树：

![这里写图片描述](http://img.blog.csdn.net/20170612033733992?watermark/2/text/aHR0cDovL2Jsb2cuY3Nkbi5uZXQvdTAxMzgxNTU0Ng==/font/5a6L5L2T/fontsize/400/fill/I0JBQkFCMA==/dissolve/70/gravity/SouthEast)

http 依赖树：

![这里写图片描述](http://img.blog.csdn.net/20170612034022465?watermark/2/text/aHR0cDovL2Jsb2cuY3Nkbi5uZXQvdTAxMzgxNTU0Ng==/font/5a6L5L2T/fontsize/400/fill/I0JBQkFCMA==/dissolve/70/gravity/SouthEast)

