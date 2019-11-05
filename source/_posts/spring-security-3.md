---
title: Spring Security(三)-- 核心配置解读
date: 2017-09-20 23:25:34
tags:
- Spring Security
categories:
- Spring Security
---

上一篇文章《Spring Security(二)--Guides》，通过 Spring Security 的配置项了解了 Spring Security 是如何保护我们的应用的，本篇文章对上一次的配置做一个分析。

[TOC]

## 3 核心配置解读

### 3.1 功能介绍 

这是 Spring Security 入门指南中的配置项：

```java
@Configuration
@EnableWebSecurity
public class WebSecurityConfig extends WebSecurityConfigurerAdapter {

  @Override
  protected void configure(HttpSecurity http) throws Exception {
      http
          .authorizeRequests()
              .antMatchers("/", "/home").permitAll()
              .anyRequest().authenticated()
              .and()
          .formLogin()
              .loginPage("/login")
              .permitAll()
              .and()
          .logout()
              .permitAll();
  }

  @Autowired
  public void configureGlobal(AuthenticationManagerBuilder auth) throws Exception {
      auth
          .inMemoryAuthentication()
              .withUser("admin").password("admin").roles("USER");
  }
}
```
当配置了上述的 javaconfig 之后，我们的应用便具备了如下的功能：

- 除了“/”,"/home"(首页),"/login"(登录),"/logout"(注销), 之外，其他路径都需要认证。
- 指定“/login”该路径为登录页面，当未认证的用户尝试访问任何受保护的资源时，都会跳转到“/login”。
- 默认指定“/logout”为注销页面
- 配置一个内存中的用户认证器，使用 admin/admin 作为用户名和密码，具有 USER 角色



- 防止 CSRF 攻击
- [Session Fixation](https://en.wikipedia.org/wiki/Session_fixation) protection(可以参考我之前讲解 Spring Session 的文章，防止别人篡改 sessionId)
- Security Header(添加一系列和 Header 相关的控制)
  - [HTTP Strict Transport Security](https://en.wikipedia.org/wiki/HTTP_Strict_Transport_Security) for secure requests
  - 集成 X-Content-Type-Options
  - 缓存控制
  - 集成 [X-XSS-Protection](https://msdn.microsoft.com/en-us/library/dd565647(v=vs.85).aspx) 
  - X-Frame-Options integration to help prevent [Clickjacking](https://en.wikipedia.org/wiki/Clickjacking)(iframe 被默认禁止使用)
- 为 Servlet API 集成了如下的几个方法
  - [HttpServletRequest#getRemoteUser()](https://docs.oracle.com/javaee/6/api/javax/servlet/http/HttpServletRequest.html#getRemoteUser())
  - [HttpServletRequest.html#getUserPrincipal()](https://docs.oracle.com/javaee/6/api/javax/servlet/http/HttpServletRequest.html#getUserPrincipal())
  - [HttpServletRequest.html#isUserInRole(java.lang.String)](https://docs.oracle.com/javaee/6/api/javax/servlet/http/HttpServletRequest.html#isUserInRole(java.lang.String))
  - [HttpServletRequest.html#login(java.lang.String, java.lang.String)](https://docs.oracle.com/javaee/6/api/javax/servlet/http/HttpServletRequest.html#login(java.lang.String,%20java.lang.String))
  - [HttpServletRequest.html#logout()](https://docs.oracle.com/javaee/6/api/javax/servlet/http/HttpServletRequest.html#logout())

### 3.2 @EnableWebSecurity

我们自己定义的配置类 WebSecurityConfig 加上了 @EnableWebSecurity 注解，同时继承了 WebSecurityConfigurerAdapter。你可能会在想谁的作用大一点，毫无疑问 @EnableWebSecurity 起到决定性的配置作用，它其实是个组合注解。

```java
@Import({ WebSecurityConfiguration.class, // <2>
      SpringWebMvcImportSelector.class }) // <1>
@EnableGlobalAuthentication // <3>
@Configuration
public @interface EnableWebSecurity {
   boolean debug() default false;
}
```

@Import 是 springboot 提供的用于引入外部的配置的注解，可以理解为：@EnableWebSecurity 注解激活了 @Import 注解中包含的配置类。

<1> `SpringWebMvcImportSelector` 的作用是判断当前的环境是否包含 springmvc，因为 spring security 可以在非 spring 环境下使用，为了避免 DispatcherServlet 的重复配置，所以使用了这个注解来区分。

<2> `WebSecurityConfiguration` 顾名思义，是用来配置 web 安全的，下面的小节会详细介绍。

<3> `@EnableGlobalAuthentication` 注解的源码如下：

```java
@Import(AuthenticationConfiguration.class)
@Configuration
public @interface EnableGlobalAuthentication {
}
```

注意点同样在 @Import 之中，它实际上激活了 AuthenticationConfiguration 这样的一个配置类，用来配置认证相关的核心类。

也就是说：@EnableWebSecurity 完成的工作便是加载了 WebSecurityConfiguration，AuthenticationConfiguration 这两个核心配置类，也就此将 spring security 的职责划分为了配置安全信息，配置认证信息两部分。

#### WebSecurityConfiguration

在这个配置类中，有一个非常重要的 Bean 被注册了。

```java
@Configuration
public class WebSecurityConfiguration {

	//DEFAULT_FILTER_NAME = "springSecurityFilterChain"
	@Bean(name = AbstractSecurityWebApplicationInitializer.DEFAULT_FILTER_NAME)
    public Filter springSecurityFilterChain() throws Exception {
    	...
    }
   
 }   
```

在未使用 springboot 之前，大多数人都应该对“springSecurityFilterChain”这个名词不会陌生，他是 spring security 的核心过滤器，是整个认证的入口。在曾经的 XML 配置中，想要启用 spring security，需要在 web.xml 中进行如下配置：

```xml
	<!-- Spring Security -->
    <filter>
        <filter-name>springSecurityFilterChain</filter-name>
        <filter-class>org.springframework.web.filter.DelegatingFilterProxy</filter-class>
    </filter>

    <filter-mapping>
        <filter-name>springSecurityFilterChain</filter-name>
        <url-pattern>/*</url-pattern>
    </filter-mapping>
```

而在 springboot 集成之后，这样的 XML 被 java 配置取代。WebSecurityConfiguration 中完成了声明 springSecurityFilterChain 的作用，并且最终交给 DelegatingFilterProxy 这个代理类，负责拦截请求（注意 DelegatingFilterProxy 这个类不是 spring security 包中的，而是存在于 web 包中，spring 使用了代理模式来实现安全过滤的解耦）。

#### AuthenticationConfiguration

```java
@Configuration
@Import(ObjectPostProcessorConfiguration.class)
public class AuthenticationConfiguration {

  	@Bean
	public AuthenticationManagerBuilder authenticationManagerBuilder(
			ObjectPostProcessor<Object> objectPostProcessor) {
		return new AuthenticationManagerBuilder(objectPostProcessor);
	}
  
  	public AuthenticationManager getAuthenticationManager() throws Exception {
    	...
    }

}
```

AuthenticationConfiguration 的主要任务，便是负责生成全局的身份认证管理者 AuthenticationManager。还记得在《Spring Security(一)--Architecture Overview》中，介绍了 Spring Security 的认证体系，AuthenticationManager 便是最核心的身份认证管理器。

### 3.3 WebSecurityConfigurerAdapter 

适配器模式在 spring 中被广泛的使用，在配置中使用 Adapter 的好处便是，我们可以选择性的配置想要修改的那一部分配置，而不用覆盖其他不相关的配置。WebSecurityConfigurerAdapter 中我们可以选择自己想要修改的内容，来进行重写，而其提供了三个 configure 重载方法，是我们主要关心的：

![WebSecurityConfigurerAdapter 中的 configure](https://kirito.iocoder.cn/QQ%E5%9B%BE%E7%89%8720170924215436.png)

由参数就可以知道，分别是对 AuthenticationManagerBuilder，WebSecurity，HttpSecurity 进行个性化的配置。

#### HttpSecurity 常用配置

```java
@Configuration
@EnableWebSecurity
public class CustomWebSecurityConfig extends WebSecurityConfigurerAdapter {
  
    @Override
    protected void configure(HttpSecurity http) throws Exception {
        http
            .authorizeRequests()
                .antMatchers("/resources/**", "/signup", "/about").permitAll()
                .antMatchers("/admin/**").hasRole("ADMIN")
                .antMatchers("/db/**").access("hasRole('ADMIN') and hasRole('DBA')")
                .anyRequest().authenticated()
                .and()
            .formLogin()
                .usernameParameter("username")
                .passwordParameter("password")
                .failureForwardUrl("/login?error")
                .loginPage("/login")
                .permitAll()
                .and()
            .logout()
                .logoutUrl("/logout")
                .logoutSuccessUrl("/index")
                .permitAll()
                .and()
            .httpBasic()
                .disable();
    }
}
```

上述是一个使用 Java Configuration 配置 HttpSecurity 的典型配置，其中 http 作为根开始配置，每一个 and()对应了一个模块的配置（等同于 xml 配置中的结束标签），并且 and() 返回了 HttpSecurity 本身，于是可以连续进行配置。他们配置的含义也非常容易通过变量本身来推测，

- authorizeRequests() 配置路径拦截，表明路径访问所对应的权限，角色，认证信息。
- formLogin() 对应表单认证相关的配置
- logout() 对应了注销相关的配置
- httpBasic() 可以配置 basic 登录
- etc

他们分别代表了 http 请求相关的安全配置，这些配置项无一例外的返回了 Configurer 类，而所有的 http 相关配置可以通过查看 HttpSecurity 的主要方法得知：

![https://kirito.iocoder.cn/QQ%E5%9B%BE%E7%89%8720170924223252.png](https://kirito.iocoder.cn/QQ%E5%9B%BE%E7%89%8720170924223252.png)

需要对 http 协议有一定的了解才能完全掌握所有的配置，不过，springboot 和 spring security 的自动配置已经足够使用了。其中每一项 Configurer（e.g.FormLoginConfigurer,CsrfConfigurer）都是 HttpConfigurer 的细化配置项。

#### WebSecurityBuilder

```java
@Configuration
@EnableWebSecurity
public class WebSecurityConfig extends WebSecurityConfigurerAdapter {
    @Override
    public void configure(WebSecurity web) throws Exception {
        web
            .ignoring()
            .antMatchers("/resources/**");
    }
}
```

以笔者的经验，这个配置中并不会出现太多的配置信息。

#### AuthenticationManagerBuilder

```java
@Configuration
@EnableWebSecurity
public class WebSecurityConfig extends WebSecurityConfigurerAdapter {
    
    @Override
    protected void configure(AuthenticationManagerBuilder auth) throws Exception {
        auth
            .inMemoryAuthentication()
            .withUser("admin").password("admin").roles("USER");
    }
}
```

想要在 WebSecurityConfigurerAdapter 中进行认证相关的配置，可以使用 configure(AuthenticationManagerBuilder auth) 暴露一个 AuthenticationManager 的建造器：AuthenticationManagerBuilder 。如上所示，我们便完成了内存中用户的配置。

细心的朋友会发现，在前面的文章中我们配置内存中的用户时，似乎不是这么配置的，而是：

```java
@Configuration
@EnableWebSecurity
public class WebSecurityConfig extends WebSecurityConfigurerAdapter {
    
    @Autowired
    public void configureGlobal(AuthenticationManagerBuilder auth) throws Exception {
        auth
            .inMemoryAuthentication()
                .withUser("admin").password("admin").roles("USER");
    }
}
```

如果你的应用只有唯一一个 WebSecurityConfigurerAdapter，那么他们之间的差距可以被忽略，从方法名可以看出两者的区别：使用 @Autowired 注入的 AuthenticationManagerBuilder 是全局的身份认证器，作用域可以跨越多个 WebSecurityConfigurerAdapter，以及影响到基于 Method 的安全控制；而 `protected configure()` 的方式则类似于一个匿名内部类，它的作用域局限于一个 WebSecurityConfigurerAdapter 内部。关于这一点的区别，可以参考我曾经提出的 issue[spring-security#issues4571](https://github.com/spring-projects/spring-security/issues/4571)。官方文档中，也给出了配置多个 WebSecurityConfigurerAdapter 的场景以及 demo，将在该系列的后续文章中解读。


** 欢迎关注我的微信公众号：「Kirito 的技术分享」，关于文章的任何疑问都会得到回复，带来更多 Java 相关的技术分享。**

![关注微信公众号](https://kirito.iocoder.cn/qrcode_for_gh_c06057be7960_258%20%281%29.jpg)




