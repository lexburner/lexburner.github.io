---
title: Spring Security(三)--核心配置解读
date: 2017-09-20 23:25:34
tags:
- Spring Security
categories:
- Spring Security
---

上一篇文章《Spring Security(二)--Guides》，通过Spring Security的配置项了解了Spring Security是如何保护我们的应用的，本篇文章对上一次的配置做一个讲解。

[TOC]

## 3 核心配置解读

### 3.1 功能介绍 

这是Spring Security入门指南中的配置项：

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
当配置了上述的javaconfig之后，我们的应用便具备了如下的功能：

- 除了“/”,"/home"(首页),"/login"(登录),"/logout"(注销),之外，其他路径都需要认证。
- 指定“/login”该路径为登录页面，当未认证的用户尝试访问任何受保护的资源时，都会跳转到“/login”。
- 默认指定“/logout”为注销页面
- 配置一个内存中的用户认证器，使用admin/admin作为用户名和密码，具有USER角色



- 防止CSRF攻击
- [Session Fixation](https://en.wikipedia.org/wiki/Session_fixation) protection(可以参考我之前讲解Spring Session的文章，防止别人篡改sessionId)
- Security Header(添加一系列和Header相关的控制)
  - [HTTP Strict Transport Security](https://en.wikipedia.org/wiki/HTTP_Strict_Transport_Security) for secure requests
  - 集成X-Content-Type-Options
  - 缓存控制
  - 集成[X-XSS-Protection](https://msdn.microsoft.com/en-us/library/dd565647(v=vs.85).aspx) 
  - X-Frame-Options integration to help prevent [Clickjacking](https://en.wikipedia.org/wiki/Clickjacking)(iframe被默认禁止使用)
- 为Servlet API集成了如下的几个方法
  - [HttpServletRequest#getRemoteUser()](https://docs.oracle.com/javaee/6/api/javax/servlet/http/HttpServletRequest.html#getRemoteUser())
  - [HttpServletRequest.html#getUserPrincipal()](https://docs.oracle.com/javaee/6/api/javax/servlet/http/HttpServletRequest.html#getUserPrincipal())
  - [HttpServletRequest.html#isUserInRole(java.lang.String)](https://docs.oracle.com/javaee/6/api/javax/servlet/http/HttpServletRequest.html#isUserInRole(java.lang.String))
  - [HttpServletRequest.html#login(java.lang.String, java.lang.String)](https://docs.oracle.com/javaee/6/api/javax/servlet/http/HttpServletRequest.html#login(java.lang.String,%20java.lang.String))
  - [HttpServletRequest.html#logout()](https://docs.oracle.com/javaee/6/api/javax/servlet/http/HttpServletRequest.html#logout())

### 3.2 解读@EnableWebSecurity

我们自己定义的配置类WebSecurityConfig加上了@EnableWebSecurity注解，同时继承了WebSecurityConfigurerAdapter。你可能会在想谁的作用大一点，先给出结论：毫无疑问@EnableWebSecurity起到决定性的配置作用，他其实是个组合注解，背后SpringBoot做了非常多的配置。

