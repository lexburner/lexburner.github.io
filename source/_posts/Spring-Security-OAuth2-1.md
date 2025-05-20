---
title: Re：从零开始的 Spring Security OAuth2（一）
date: 2017-08-08 15:16:52
tags: 
- Spring Security OAuth2
categories: 
- Spring Security OAuth2
toc: true
---

## 前言
今天来聊聊一个接口对接的场景，A 厂家有一套 HTTP 接口需要提供给 B 厂家使用，由于是外网环境，所以需要有一套安全机制保障，这个时候 oauth2 就可以作为一个方案。

关于 oauth2，其实是一个规范，本文重点讲解 spring 对他进行的实现，如果你还不清楚授权服务器，资源服务器，认证授权等基础概念，可以移步 [理解 OAuth 2.0 - 阮一峰](http://www.ruanyifeng.com/blog/2014/05/oauth_2_0.html)，这是一篇对于 oauth2 很好的科普文章。 

需要对 spring security 有一定的配置使用经验，用户认证这一块，spring security oauth2 建立在 spring security 的基础之上。第一篇文章主要是讲解使用 springboot 搭建一个简易的授权，资源服务器，在文末会给出具体代码的 github 地址。后续文章会进行 spring security oauth2 的相关源码分析。java 中的安全框架如 shrio，已经有 [跟我学 shiro - 开涛](http://jinnianshilongnian.iteye.com/blog/2018936)，非常成体系地，深入浅出地讲解了 apache 的这个开源安全框架，但是 spring security 包括 oauth2 一直没有成体系的文章，学习它们大多依赖于较少的官方文档，理解一下基本的使用配置；通过零散的博客，了解一下他人的使用经验；打断点，分析内部的工作流程；看源码中的接口设计，以及注释，了解设计者的用意。spring 的各个框架都运用了很多的设计模式，在学习源码的过程中，也大概了解了一些套路。spring 也在必要的地方添加了适当的注释，避免了源码阅读者对于一些细节设计的理解产生偏差，让我更加感叹，spring 不仅仅是一个工具框架，更像是一个艺术品。

<!-- more -->

## 概述
使用 oauth2 保护你的应用，可以分为简易的分为三个步骤

* 配置资源服务器
* 配置认证服务器
* 配置 spring security

前两点是 oauth2 的主体内容，但前面我已经描述过了，spring security oauth2 是建立在 spring security 基础之上的，所以有一些体系是公用的。

oauth2 根据使用场景不同，分成了 4 种模式

* 授权码模式（authorization code）
* 简化模式（implicit）
* 密码模式（resource owner password credentials）
* 客户端模式（client credentials）

本文重点讲解接口对接中常使用的密码模式（以下简称 password 模式）和客户端模式（以下简称 client 模式）。授权码模式使用到了回调地址，是最为复杂的方式，通常网站中经常出现的微博，qq 第三方登录，都会采用这个形式。简化模式不常用。

## 项目准备
主要的 maven 依赖如下

```xml
<!-- 注意是 starter, 自动配置 -->
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-security</artifactId>
</dependency>
<!-- 不是 starter, 手动配置 -->
<dependency>
    <groupId>org.springframework.security.oauth</groupId>
    <artifactId>spring-security-oauth2</artifactId>
</dependency>
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-web</artifactId>
</dependency>
<!-- 将 token 存储在 redis 中 -->
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-data-redis</artifactId>
</dependency>
```

我们给自己先定个目标，要干什么事？既然说到保护应用，那必须得先有一些资源，我们创建一个 endpoint 作为提供给外部的接口：
```java
@RestController
public class TestEndpoints {

    @GetMapping("/product/{id}")
    public String getProduct(@PathVariable String id) {
        //for debug
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        return "product id :" + id;
    }

    @GetMapping("/order/{id}")
    public String getOrder(@PathVariable String id) {
	    //for debug
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        return "order id :" + id;
    }

}
```

暴露一个商品查询接口，后续不做安全限制，一个订单查询接口，后续添加访问控制。

## 配置资源服务器和授权服务器
由于是两个 oauth2 的核心配置，我们放到一个配置类中。
为了方便下载代码直接运行，我这里将客户端信息放到了内存中，生产中可以配置到数据库中。token 的存储一般选择使用 redis，一是性能比较好，二是自动过期的机制，符合 token 的特性。
```java
@Configuration
public class OAuth2ServerConfig {

    private static final String DEMO_RESOURCE_ID = "order";

    @Configuration
    @EnableResourceServer
    protected static class ResourceServerConfiguration extends ResourceServerConfigurerAdapter {

        @Override
        public void configure(ResourceServerSecurityConfigurer resources) {
            resources.resourceId(DEMO_RESOURCE_ID).stateless(true);
        }

        @Override
        public void configure(HttpSecurity http) throws Exception {
            // @formatter:off
            http
                    // Since we want the protected resources to be accessible in the UI as well we need
                    // session creation to be allowed (it's disabled by default in 2.0.6)
                    .sessionManagement().sessionCreationPolicy(SessionCreationPolicy.IF_REQUIRED)
                    .and()
                    .requestMatchers().anyRequest()
                    .and()
                    .anonymous()
                    .and()
                    .authorizeRequests()
//                    .antMatchers("/product/**").access("#oauth2.hasScope('select') and hasRole('ROLE_USER')")
                    .antMatchers("/order/**").authenticated();// 配置 order 访问控制，必须认证过后才可以访问
            // @formatter:on
        }
    }
    
    @Configuration
    @EnableAuthorizationServer
    protected static class AuthorizationServerConfiguration extends AuthorizationServerConfigurerAdapter {

        @Autowired
        AuthenticationManager authenticationManager;
        @Autowired
        RedisConnectionFactory redisConnectionFactory;

        @Override
        public void configure(ClientDetailsServiceConfigurer clients) throws Exception {
            // 配置两个客户端, 一个用于 password 认证一个用于 client 认证
            clients.inMemory().withClient("client_1")
                    .resourceIds(DEMO_RESOURCE_ID)
                    .authorizedGrantTypes("client_credentials", "refresh_token")
                    .scopes("select")
                    .authorities("client")
                    .secret("123456")
                    .and().withClient("client_2")
                    .resourceIds(DEMO_RESOURCE_ID)
                    .authorizedGrantTypes("password", "refresh_token")
                    .scopes("select")
                    .authorities("client")
                    .secret("123456");
        }

        @Override
        public void configure(AuthorizationServerEndpointsConfigurer endpoints) throws Exception {
            endpoints
                    .tokenStore(new RedisTokenStore(redisConnectionFactory))
                    .authenticationManager(authenticationManager);
        }

        @Override
        public void configure(AuthorizationServerSecurityConfigurer oauthServer) throws Exception {
            // 允许表单认证
            oauthServer.allowFormAuthenticationForClients();
        }

    }

}
```



简单说下 spring security oauth2 的认证思路。

* client 模式，没有用户的概念，直接与认证服务器交互，用配置中的客户端信息去申请 accessToken，客户端有自己的 client_id,client_secret 对应于用户的 username,password，而客户端也拥有自己的 authorities，当采取 client 模式认证时，对应的权限也就是客户端自己的 authorities。

* password 模式，自己本身有一套用户体系，在认证时需要带上自己的用户名和密码，以及客户端的 client_id,client_secret。此时，accessToken 所包含的权限是用户本身的权限，而不是客户端的权限。

我对于两种模式的理解便是，如果你的系统已经有了一套用户体系，每个用户也有了一定的权限，可以采用 password 模式；如果仅仅是接口的对接，不考虑用户，则可以使用 client 模式。

## 配置 spring security
在 spring security 的版本迭代中，产生了多种配置方式，建造者模式，适配器模式等等设计模式的使用，spring security 内部的认证 flow 也是错综复杂，在我一开始学习 ss 也产生了不少困惑，总结了一下配置经验：使用了 springboot 之后，spring security 其实是有不少自动配置的，我们可以仅仅修改自己需要的那一部分，并且遵循一个原则，直接覆盖最需要的那一部分。这一说法比较抽象，举个例子。比如配置内存中的用户认证器。有两种配置方式

planA：

```java
@Bean
protected UserDetailsService userDetailsService(){
    InMemoryUserDetailsManager manager = new InMemoryUserDetailsManager();
    manager.createUser(User.withUsername("user_1").password("123456").authorities("USER").build());
    manager.createUser(User.withUsername("user_2").password("123456").authorities("USER").build());
    return manager;
}
```

planB：

```java
@Configuration
@EnableWebSecurity
public class SecurityConfiguration extends WebSecurityConfigurerAdapter {

    @Override
    protected void configure(AuthenticationManagerBuilder auth) throws Exception {
        auth.inMemoryAuthentication()
                .withUser("user_1").password("123456").authorities("USER")
                .and()
                .withUser("user_2").password("123456").authorities("USER");
   }

   @Bean
   @Override
   public AuthenticationManager authenticationManagerBean() throws Exception {
       AuthenticationManager manager = super.authenticationManagerBean();
        return manager;
    }
}
```
你最终都能得到配置在内存中的两个用户，前者是直接替换掉了容器中的 UserDetailsService，这么做比较直观；后者是替换了 AuthenticationManager，当然你还会在 SecurityConfiguration 复写其他配置，这么配置最终会由一个委托者去认证。如果你熟悉 spring security，会知道 AuthenticationManager 和 AuthenticationProvider 以及 UserDetailsService 的关系，他们都是顶级的接口，实现类之间错综复杂的聚合关系... 配置方式千差万别，但理解清楚认证流程，知道各个实现类对应的职责才是掌握 spring security 的关键。

下面给出我最终的配置：

```java
@Configuration
@EnableWebSecurity
public class SecurityConfiguration extends WebSecurityConfigurerAdapter {

    @Bean
    @Override
    protected UserDetailsService userDetailsService(){
        InMemoryUserDetailsManager manager = new InMemoryUserDetailsManager();
        manager.createUser(User.withUsername("user_1").password("123456").authorities("USER").build());
        manager.createUser(User.withUsername("user_2").password("123456").authorities("USER").build());
        return manager;
    }

    @Override
    protected void configure(HttpSecurity http) throws Exception {
        // @formatter:off
        http
            .requestMatchers().anyRequest()
            .and()
                .authorizeRequests()
                .antMatchers("/oauth/*").permitAll();
        // @formatter:on
    }
}
```
重点就是配置了一个 UserDetailsService，和 ClientDetailsService 一样，为了方便运行，使用内存中的用户，实际项目中，一般使用的是数据库保存用户，具体的实现类可以使用 JdbcDaoImpl 或者 JdbcUserDetailsManager。

## 获取 token
进行如上配置之后，启动 springboot 应用就可以发现多了一些自动创建的 endpoints：

```java
{[/oauth/authorize]}
{[/oauth/authorize],methods=[POST]
{[/oauth/token],methods=[GET]}
{[/oauth/token],methods=[POST]}
{[/oauth/check_token]}
{[/oauth/error]}
```
重点关注一下 /oauth/token，它是获取的 token 的 endpoint。启动 springboot 应用之后，使用 http 工具访问
password 模式：

`http://localhost:8080/oauth/token?username=user_1&password=123456&grant_type=password&scope=select&client_id=client_2&client_secret=123456`

响应如下：
`{"access_token":"950a7cc9-5a8a-42c9-a693-40e817b1a4b0","token_type":"bearer","refresh_token":"773a0fcd-6023-45f8-8848-e141296cb3cb","expires_in":27036,"scope":"select"}`

client 模式：
`http://localhost:8080/oauth/token?grant_type=client_credentials&scope=select&client_id=client_1&client_secret=123456`

响应如下：
`{"access_token":"56465b41-429d-436c-ad8d-613d476ff322","token_type":"bearer","expires_in":25074,"scope":"select"}`

在配置中，我们已经配置了对 order 资源的保护，如果直接访问:`http://localhost:8080/order/1` 会得到这样的响应:`{"error":"unauthorized","error_description":"Full authentication is required to access this resource"}`
（这样的错误响应可以通过重写配置来修改）

而对于未受保护的 product 资源 `http://localhost:8080/product/1` 则可以直接访问，得到响应 `product id : 1`

携带 accessToken 参数访问受保护的资源：

使用 password 模式获得的 token:`http://localhost:8080/order/1?access_token=950a7cc9-5a8a-42c9-a693-40e817b1a4b0`，得到了之前匿名访问无法获取的资源：`order id : 1`

使用 client 模式获得的 token:`http://localhost:8080/order/1?access_token=56465b41-429d-436c-ad8d-613d476ff322`，同上的响应 `order id : 1`

我们重点关注一下 debug 后，对资源访问时系统记录的用户认证信息，可以看到如下的 debug 信息

password 模式：

![password 模式](https://kirito.iocoder.cn/20170808145230975.png)

client 模式：

![client 模式](https://kirito.iocoder.cn/20170808145304794.png)

和我们的配置是一致的，仔细看可以发现两者的身份有些许的不同。想要查看更多的 debug 信息，可以选择下载 demo 代码自己查看，为了方便读者调试和验证，我去除了很多复杂的特性，基本实现了一个最简配置，涉及到数据库的地方也尽量配置到了内存中，这点记住在实际使用时一定要修改。

到这儿，一个简单的 oauth2 入门示例就完成了，一个简单的配置教程。token 的工作原理是什么，它包含了哪些信息？spring 内部如何对身份信息进行验证？以及上述的配置到底影响了什么？这些内容会放到后面的文章中去分析。

## 示例代码下载
全部的代码可以在我的 github 上进行下载，项目使用 springboot+maven 构建：
https://github.com/lexburner/oauth2-demo


** 欢迎关注我的微信公众号：「Kirito 的技术分享」，关于文章的任何疑问都会得到回复，带来更多 Java 相关的技术分享。**

![关注微信公众号](https://kirito.iocoder.cn/qrcode_for_gh_c06057be7960_258%20%281%29.jpg)


