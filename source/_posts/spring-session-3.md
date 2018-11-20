---
title: Re：从零开始的Spring Session(三)
date: 2017-09-04 20:57:43
tags: 
- Spring Session
- Spring
categories:
- Spring Session
---

上一篇文章中，我们使用Redis集成了Spring Session。大多数的配置都是Spring Boot帮我们自动配置的，这一节我们介绍一点Spring Session较为高级的特性。

## 集成Spring Security

之所以把Spring Session和Spring Security放在一起讨论，是因为我们的应用在集成Spring Security之后，用户相关的认证与Session密不可分，如果不注意一些细节，会引发意想不到的问题。

与Spring Session相关的依赖可以参考上一篇文章，这里给出增量的依赖：

```xml
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-security</artifactId>
</dependency>
```

我们引入依赖后，就已经自动配置了Spring Security，我们在application.yml添加一个内存中的用户：

```yaml
security:
  user:
    name: admin
    password: admin
```

测试登录点沿用上一篇文章的端点，访问`http://localhost:8080/test/cookie?browser=chrome`端点后会出现http basic的认证框，我们输入admin/admin，即可获得结果，也遇到了第一个坑点，我们会发现每次请求，sessionId都会被刷新，这显然不是我们想要的结果。

![诡异的运行结果](http://kirito.iocoder.cn/QQ%E5%9B%BE%E7%89%8720170904212709.png)

这个现象笔者研究了不少源码，但并没有得到非常满意的解释，只能理解为SecurityAutoConfiguration提供的默认配置，没有触发到响应的配置，导致了session的不断刷新（如果读者有合理的解释可以和我沟通）。Spring Session之所以能够替换默认的tomcat httpSession是因为配置了`springSessionRepositoryFilter`这个过滤器，且提供了非常高的优先级，这归功于`AbstractSecurityWebApplicationInitializer` ，`AbstractHttpSessionApplicationInitializer` 这两个初始化器，当然，也保证了Spring Session会在Spring Security之前起作用。

而解决上述的诡异现象也比较容易（但原理不清），我们使用@EnableWebSecurity对Spring Security进行一些配置，即可解决这个问题。

```java
@EnableWebSecurity
public class SecurityConfig extends WebSecurityConfigurerAdapter {

    // @formatter:off
    @Override
    protected void configure(HttpSecurity http) throws Exception {
        http
            .authorizeRequests()
            .antMatchers("/resources/**").permitAll()
            .anyRequest().authenticated()
            .and()
                .httpBasic()//<1>
            .and()
            .logout().permitAll();
    }
    // @formatter:on

    // @formatter:off
    @Autowired
    public void configureGlobal(AuthenticationManagerBuilder auth) throws Exception {
        auth
                .inMemoryAuthentication()
                .withUser("admin").password("admin").roles("USER");//<2>
    }
    // @formatter:on
}
```

<1> 不想大费周章写一个登录页面，于是开启了http basic认证

<2> 配置了security config之后，springboot的autoConfig就会失效，于是需要手动配置用户。

再次请求，可以发现SessionId返回正常，@EnableWebSecurity似乎触发了相关的配置，当然了，我们在使用Spring Security时不可能使用autoconfig，但是这个现象的确是一个疑点。

## 使用自定义CookieSerializer

```java
@Bean
public CookieSerializer cookieSerializer() {
    DefaultCookieSerializer serializer = new DefaultCookieSerializer();
    serializer.setCookieName("JSESSIONID");
    serializer.setCookiePath("/");
    serializer.setDomainNamePattern("^.+?\\.(\\w+\\.[a-z]+)$");
    return serializer;
}
```

使用上述配置后，我们可以将Spring Session默认的Cookie Key从SESSION替换为原生的JSESSIONID。而CookiePath设置为根路径且配置了相关的正则表达式，可以达到同父域下的单点登录的效果，在未涉及跨域的单点登录系统中，这是一个非常优雅的解决方案。如果我们的当前域名是`moe.cnkirito.moe`，该正则会将Cookie设置在父域`cnkirito.moe`中，如果有另一个相同父域的子域名`blog.cnkirito.moe`也会识别这个Cookie，便可以很方便的实现同父域下的单点登录。

## 根据用户名查找用户归属的SESSION

这个特性听起来非常有意思，你可以在一些有趣的场景下使用它，如知道用户名后即可删除其SESSION。一直以来我们都是通过线程绑定的方式，让用户操作自己的SESSION，包括获取用户名等操作。但如今它提供了一个反向的操作，根据用户名获取SESSION，恰巧，在一些项目中真的可以使用到这个特性，最起码，当别人问起你，或者讨论到和SESSION相关的知识时，你可以明晰一点，这是可以做到的。

我们使用Redis作为Session Store还有一个好处，就是其实现了`FindByIndexNameSessionRepository`接口，下面让我们来见证这一点。

```java
@Controller
public class CookieController {
    @Autowired
    FindByIndexNameSessionRepository<? extends ExpiringSession> sessionRepository;

    @RequestMapping("/test/findByUsername")
    @ResponseBody
    public Map findByUsername(@RequestParam String username) {
        Map<String, ? extends ExpiringSession> usersSessions = sessionRepository.findByIndexNameAndIndexValue(FindByIndexNameSessionRepository.PRINCIPAL_NAME_INDEX_NAME, username);
        return usersSessions;
    }
}
```

由于一个用户可能拥有多个Session，所以返回的是一个Map信息，而这里的username，则就是与Spring Security集成之后的用户名，最令人感动Spring厉害的地方，是这一切都是自动配置好的。我们在内存中配置的用户的username是admin，于是我们访问这个端点,可以看到如下的结果

![用户名访问session](http://kirito.iocoder.cn/2.png)

连同我们存入session中的browser=chrome，browser=360都可以看见（只有键名）。

## 总结

Spring Session对各种场景下的Session管理提供一套非常完善的实现。笔者所介绍的，仅仅是Spring Session常用的一些特性，更多的知识点可以在spring.io的文档中一览无余，以及本文中作者存在的一个疑惑，如有兴趣可与我沟通。

**欢迎关注我的微信公众号：「Kirito的技术分享」，关于文章的任何疑问都会得到回复，带来更多 Java 相关的技术分享。**

![关注微信公众号](http://kirito.iocoder.cn/qrcode_for_gh_c06057be7960_258%20%281%29.jpg)