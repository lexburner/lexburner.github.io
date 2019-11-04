---
title: Spring Security(二)--Guides
date: 2017-09-20 23:25:34
tags:
- Spring Security
categories:
- Spring Security
---

上一篇文章《Spring Security(一)--Architecture Overview》，我们介绍了 Spring Security 的基础架构，这一节我们通过 Spring 官方给出的一个 guides 例子，来了解 Spring Security 是如何保护我们的应用的，之后会对进行一个解读。

[TOC]

## 2 Spring Security Guides

### 2.1 引入依赖

```xml
<dependencies>
    <dependency>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-web</artifactId>
    </dependency>
    <dependency>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-security</artifactId>
    </dependency>
    <dependency>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-thymeleaf</artifactId>
    </dependency>
</dependencies>
```

由于我们集成了 springboot，所以不需要显示的引入 Spring Security 文档中描述 core，config 依赖，只需要引入 spring-boot-starter-security 即可。

<!-- more -->

### 2.2 创建一个不受安全限制的 web 应用

这是一个首页，不受安全限制

`src/main/resources/templates/home.html`

```html
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:th="http://www.thymeleaf.org" xmlns:sec="http://www.thymeleaf.org/thymeleaf-extras-springsecurity3">
    <head>
        <title>Spring Security Example</title>
    </head>
    <body>
        <h1>Welcome!</h1>

        <p>Click <a th:href="@{/hello}">here</a> to see a greeting.</p>
    </body>
</html>
```

这个简单的页面上包含了一个链接，跳转到 "/hello"。对应如下的页面

`src/main/resources/templates/hello.html`

```html
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:th="http://www.thymeleaf.org"
      xmlns:sec="http://www.thymeleaf.org/thymeleaf-extras-springsecurity3">
    <head>
        <title>Hello World!</title>
    </head>
    <body>
        <h1>Hello world!</h1>
    </body>
</html>
```

接下来配置 Spring MVC，使得我们能够访问到页面。

```java
@Configuration
public class MvcConfig extends WebMvcConfigurerAdapter {

    @Override
    public void addViewControllers(ViewControllerRegistry registry) {
        registry.addViewController("/home").setViewName("home");
        registry.addViewController("/").setViewName("home");
        registry.addViewController("/hello").setViewName("hello");
        registry.addViewController("/login").setViewName("login");
    }

}
```

### 2.3 配置 Spring Security

一个典型的安全配置如下所示：

```java
@Configuration
@EnableWebSecurity <1>
public class WebSecurityConfig extends WebSecurityConfigurerAdapter { <1>
    @Override
    protected void configure(HttpSecurity http) throws Exception {
        http <2>
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
        auth <3>
            .inMemoryAuthentication()
                .withUser("admin").password("admin").roles("USER");
    }
}
```

<1> @EnableWebSecurity 注解使得 SpringMVC 集成了 Spring Security 的 web 安全支持。另外，WebSecurityConfig 配置类同时集成了 WebSecurityConfigurerAdapter，重写了其中的特定方法，用于自定义 Spring Security 配置。整个 Spring Security 的工作量，其实都是集中在该配置类，不仅仅是这个 guides，实际项目中也是如此。

<2> `configure(HttpSecurity)` 定义了哪些 URL 路径应该被拦截，如字面意思所描述："/", "/home" 允许所有人访问，"/login" 作为登录入口，也被允许访问，而剩下的 "/hello" 则需要登陆后才可以访问。

<3> `configureGlobal(AuthenticationManagerBuilder)` 在内存中配置一个用户，admin/admin 分别是用户名和密码，这个用户拥有 USER 角色。

我们目前还没有登录页面，下面创建登录页面：

```html
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:th="http://www.thymeleaf.org"
      xmlns:sec="http://www.thymeleaf.org/thymeleaf-extras-springsecurity3">
    <head>
        <title>Spring Security Example </title>
    </head>
    <body>
        <div th:if="${param.error}">
            Invalid username and password.
        </div>
        <div th:if="${param.logout}">
            You have been logged out.
        </div>
        <form th:action="@{/login}" method="post">
            <div><label> User Name : <input type="text" name="username"/> </label></div>
            <div><label> Password: <input type="password" name="password"/> </label></div>
            <div><input type="submit" value="Sign In"/></div>
        </form>
    </body>
</html>
```

这个 Thymeleaf 模板提供了一个用于提交用户名和密码的表单, 其中 name="username"，name="password" 是默认的表单值，并发送到“/ login”。 在默认配置中，Spring Security 提供了一个拦截该请求并验证用户的过滤器。 如果验证失败，该页面将重定向到“/ login?error”，并显示相应的错误消息。 当用户选择注销，请求会被发送到“/ login?logout”。

最后，我们为 hello.html 添加一些内容，用于展示用户信息。

```html
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:th="http://www.thymeleaf.org"
      xmlns:sec="http://www.thymeleaf.org/thymeleaf-extras-springsecurity3">
    <head>
        <title>Hello World!</title>
    </head>
    <body>
        <h1 th:inline="text">Hello [[${#httpServletRequest.remoteUser}]]!</h1>
        <form th:action="@{/logout}" method="post">
            <input type="submit" value="Sign Out"/>
        </form>
    </body>
</html>
```

我们使用 Spring Security 之后，HttpServletRequest#getRemoteUser() 可以用来获取用户名。 登出请求将被发送到“/ logout”。 成功注销后，会将用户重定向到“/ login?logout”。

### 2.4 添加启动类

```java
@SpringBootApplication
public class Application {

    public static void main(String[] args) throws Throwable {
        SpringApplication.run(Application.class, args);
    }

}
```

### 2.5 测试

访问首页 `http://localhost:8080/`:

![home.html](http://kirito.iocoder.cn/home.png)

点击 here，尝试访问受限的页面：`/hello`, 由于未登录，结果被强制跳转到登录也 `/login`：

![login.html](http://kirito.iocoder.cn/login.png)

输入正确的用户名和密码之后，跳转到之前想要访问的 `/hello`:

![hello.html](http://kirito.iocoder.cn/hello.png)

点击 Sign out 退出按钮，访问:`/logout`, 回到登录页面:

![logout.html](http://kirito.iocoder.cn/logout.png)

### 2.6 总结

本篇文章没有什么干货，基本算是翻译了 Spring Security Guides 的内容，稍微了解 Spring Security 的朋友都不会对这个翻译感到陌生。考虑到受众的问题，一个入门的例子是必须得有的，方便后续对 Spring Security 的自定义配置进行讲解。下一节，以此 guides 为例，讲解这些最简化的配置背后，Spring Security 都帮我们做了什么工作。

本节所有的代码，可以直接在 Spring 的官方仓库下载得到，`git clone https://github.com/spring-guides/gs-securing-web.git`。不过，建议初学者根据文章先一步步配置，出了问题，再与 demo 进行对比。

** 欢迎关注我的微信公众号：「Kirito 的技术分享」，关于文章的任何疑问都会得到回复，带来更多 Java 相关的技术分享。**

![关注微信公众号](http://kirito.iocoder.cn/qrcode_for_gh_c06057be7960_258%20%281%29.jpg)
