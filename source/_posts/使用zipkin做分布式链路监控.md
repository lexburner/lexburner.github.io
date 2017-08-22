---
title: 使用zipkin做分布式链路监控
date: 2017-06-12 02:51:51
tags: 
- Zipkin
- DevOps
categories: 
- DevOps
---

# 介绍   
* Zipkin 为一个分布式的调用链跟踪系统( distributed tracing system ) ,设计来源于 [google dapper paper](http://research.google.com/pubs/pub36356.html)
*  [官方网站](http://zipkin.io/)

# 快速入门

 - 安装方式一：使用zipkin官方提供的jar启动服务
  zipkin官方提供了一个现成的使用springboot写的zipkin服务端，客户端的链路监控报告可以通过多种方式（下文会讲解具体的方式）向服务端发送报告。
* 系统需要安装java8 
* [下载地址](https://search.maven.org/remote_content?g=io.zipkin.java&a=zipkin-server&v=LATEST&c=exec)

  配置详解
  ![存储方式](http://img.blog.csdn.net/20170612021516652?watermark/2/text/aHR0cDovL2Jsb2cuY3Nkbi5uZXQvdTAxMzgxNTU0Ng==/font/5a6L5L2T/fontsize/400/fill/I0JBQkFCMA==/dissolve/70/gravity/SouthEast)
  查看源码可知其有4种持久化方式，本文选择使用最熟悉的mysql持久化链路调用信息。

首先建立数据库：
默认情况下 zipkin 运行时数据保存在内存中，重启数据会丢失
[数据库脚本下载](https://github.com/openzipkin/zipkin/blob/master/zipkin-storage/mysql/src/main/resources/mysql.sql)

查看与mysql storage相关的配置
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
所以，我们使用mysql作为持久化策略，启动服务端的脚本也就有了
```shell
java -server -jar zipkin-server-1.26.0-exec.jar --zipkin.storage.type=mysql --zipkin.storage.mysql.host=localhost --zipkin.storage.mysql.port=3306 --zipkin.storage.mysql.username=root --zipkin.storage.mysql.password=root --zipkin.storage.mysql.db=zipkin
```

- 安装方式二
  springcloud官方按照传输方式分成了三种启动服务端的方式：Sleuth with Zipkin via HTTP，Sleuth with Zipkin via Spring Cloud Stream，Spring Cloud Sleuth Stream Zipkin Collector。只需要添加相应的依赖，之后配置相应的注解，如`@EnableZipkinStreamServer`即可。具体配置参考[Spring Cloud官方文档](http://cloud.spring.io/spring-cloud-static/spring-cloud-sleuth/1.2.1.RELEASE/#_adding_to_the_project)

项目中，我们使用第一种作为服务端的启动方式，使用mysql作为持久化方案

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
springboot对zipkin的自动配置可以使得所有RequestMapping匹配到的endpoints得到监控，以及强化了restTemplate，对其加了一层拦截器，使得由他发起的http请求也同样被监控。

# motan rpc调用监控
Motan通过filter的SPI扩展机制支持OpenTracing，可以支持任何实现了OpenTracing标准的trace实现。使用OpenTracing需要以下步骤。

1.引入filter-opentracing扩展
```xml
<dependency>
     <groupId>com.weibo</groupId>
     <artifactId>filter-opentracing</artifactId>
     <version>release</version>
</dependency>
```

2.如果第三方trace工具声明了io.opentracing.Tracer的SPI扩展，直接引入第三方trace的jar包即可。如果第三方没有声明，则转第三步。

3.自定义一个TracerFactory实现TracerFactory接口，通过getTracer()来获取不同tracer实现。设置OpenTracingContext的tracerFactory为自定义的TracerFactory即可。


项目中的具体配置MotanConfig.java：
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
具体的服务就不列出来了，为了演示依赖关系，service1使用restTemplate调用了service2,service2调用了service3，service4。
还有一些现成的motan调用

- **find a trace**
  当应用正常启动后，可以通过 http://10.19.52.11:9411 查看管理端
  ![这里写图片描述](http://img.blog.csdn.net/20170612033405237?watermark/2/text/aHR0cDovL2Jsb2cuY3Nkbi5uZXQvdTAxMzgxNTU0Ng==/font/5a6L5L2T/fontsize/400/fill/I0JBQkFCMA==/dissolve/70/gravity/SouthEast)
  项目已经成功被监控

- **Dependencies**

motan依赖树：

![这里写图片描述](http://img.blog.csdn.net/20170612033733992?watermark/2/text/aHR0cDovL2Jsb2cuY3Nkbi5uZXQvdTAxMzgxNTU0Ng==/font/5a6L5L2T/fontsize/400/fill/I0JBQkFCMA==/dissolve/70/gravity/SouthEast)

http依赖树：

![这里写图片描述](http://img.blog.csdn.net/20170612034022465?watermark/2/text/aHR0cDovL2Jsb2cuY3Nkbi5uZXQvdTAxMzgxNTU0Ng==/font/5a6L5L2T/fontsize/400/fill/I0JBQkFCMA==/dissolve/70/gravity/SouthEast)

