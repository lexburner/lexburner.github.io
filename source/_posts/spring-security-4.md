---
title: Spring Security(四)--详解登录认证流程
date: 2017-09-20 23:25:34
tags:
- Spring Security
categories:
- Spring Security
---

[TOC]

前面的部分，我们关注了Spring Security是如何完成认证工作的，但是另外一部分核心的内容：过滤器，一直没有提到，我们已经知道Spring Security使用了springSecurityFillterChian作为了安全过滤的入口，这一节主要分析一下这个过滤器链都包含了哪些关键的过滤器，并且各自的使命是什么。

## 4 过滤器详解

### 4.1 核心过滤器概述

由于过滤器链路中的过滤较多，即使是Spring Security的官方文档中也并未对所有的过滤器进行介绍，在之前，《Spring Security(二)--Guides》入门指南中我们配置了一个表单登录的demo，以此为例，来看看这过程中Spring Security都帮我们自动配置了哪些过滤器。

```java
Creating filter chain: o.s.s.web.util.matcher.AnyRequestMatcher@1, 
[o.s.s.web.context.SecurityContextPersistenceFilter@8851ce1, 
o.s.s.web.header.HeaderWriterFilter@6a472566, o.s.s.web.csrf.CsrfFilter@61cd1c71, 
o.s.s.web.authentication.logout.LogoutFilter@5e1d03d7, 
o.s.s.web.authentication.UsernamePasswordAuthenticationFilter@122d6c22, 
o.s.s.web.savedrequest.RequestCacheAwareFilter@5ef6fd7f, 
o.s.s.web.servletapi.SecurityContextHolderAwareRequestFilter@4beaf6bd, 
o.s.s.web.authentication.AnonymousAuthenticationFilter@6edcad64, 
o.s.s.web.session.SessionManagementFilter@5e65afb6, 
o.s.s.web.access.ExceptionTranslationFilter@5b9396d3, 
o.s.s.web.access.intercept.FilterSecurityInterceptor@3c5dbdf8
]
```

上述的log信息是我从springboot启动的日志中CV所得，spring security的过滤器日志有一个特点：log打印顺序与实际配置顺序符合，也就意味着`SecurityContextPersistenceFilter`是整个过滤器链的第一个过滤器，而`FilterSecurityInterceptor`则是末置的过滤器。另外通过观察过滤器的名称，和所在的包名，可以大致地分析出他们各自的作用，如`UsernamePasswordAuthenticationFilter`明显便是与使用用户名和密码登录相关的过滤器，而`FilterSecurityInterceptor`我们似乎看不出它的作用，但是其位于`web.access`包下，大致可以分析出他与权限相关。第四篇文章主要就是介绍这些常用的过滤器，对其中关键的过滤器进行一些源码分析。先大致介绍下每个过滤器的作用：

- **SecurityContextPersistenceFilter** 两个主要职责：请求来临时，创建`SecurityContext`安全上下文信息，请求结束时清空`SecurityContextHolder`。
- HeaderWriterFilter (文档中并未介绍，非核心过滤器) 用来给http响应添加一些Header,比如X-Frame-Options, X-XSS-Protection*，X-Content-Type-Options.
- CsrfFilter 在spring4这个版本中被默认开启的一个过滤器，用于防止csrf攻击，了解前后端分离的人一定不会对这个攻击方式感到陌生，前后端使用json交互需要注意的一个问题。
- LogoutFilter 顾名思义，处理注销的过滤器
- **UsernamePasswordAuthenticationFilter** 这个会重点分析，表单提交了username和password，被封装成token进行一系列的认证，便是主要通过这个过滤器完成的，在表单认证的方法中，这是最最关键的过滤器。
- RequestCacheAwareFilter  (文档中并未介绍，非核心过滤器) 内部维护了一个RequestCache，用于缓存request请求
- SecurityContextHolderAwareRequestFilter 此过滤器对ServletRequest进行了一次包装，使得request具有更加丰富的API
- **AnonymousAuthenticationFilter** 匿名身份过滤器，这个过滤器个人认为很重要，需要将它与UsernamePasswordAuthenticationFilter 放在一起比较理解，spring security为了兼容未登录的访问，也走了一套认证流程，只不过是一个匿名的身份。
- SessionManagementFilter 和session相关的过滤器，内部维护了一个SessionAuthenticationStrategy，两者组合使用，常用来防止`session-fixation protection attack`，以及限制同一用户开启多个会话的数量
- **ExceptionTranslationFilter** 直译成异常翻译过滤器，还是比较形象的，这个过滤器本身不处理异常，而是将认证过程中出现的异常交给内部维护的一些类去处理，具体是那些类下面详细介绍
- **FilterSecurityInterceptor** 这个过滤器决定了访问特定路径应该具备的权限，访问的用户的角色，权限是什么？访问的路径需要什么样的角色和权限？这些判断和处理都是由该类进行的。

其中加粗的过滤器可以被认为是Spring Security的核心过滤器，将在下面，一个过滤器对应一个小节来讲解。

### 4.2 SecurityContextPersistenceFilter 

试想一下，如果我们不使用Spring Security，如果保存用户信息呢，比如用户登录后需要保存当前登录用户的身份信息和详细信息，大多数情况下会考虑使用Session来保存对吧？在Spring Security中也是如此，用户在登录过一次之后，后续的访问便是通过sessionId来识别从而认为用户已经被认证。具体在何处存放用户信息，便是第一篇文章中提到的SecurityContextHolder；认证相关的信息是如何被存放到其中的，便是通过SecurityContextPersistenceFilter。在4.1概述中也提到了，SecurityContextPersistenceFilter的两个主要作用便是请求来临时，创建`SecurityContext`安全上下文信息和请求结束时清空`SecurityContextHolder`。顺带提一下：微服务的一个设计理念需要实现服务通信的无状态，而http协议中的无状态意味着不允许存在session，这可以通过`setAllowSessionCreation(false)` 实现，这并不意味着SecurityContextPersistenceFilter变得无用，因为它还需要负责清除用户信息。在Spring Security中，虽然安全上下文信息被存储于Session中，但我们在实际使用中不应该直接操作Session，而应当使用SecurityContextHolder。

#### 源码分析

`org.springframework.security.web.context.SecurityContextPersistenceFilter`

```java
public class SecurityContextPersistenceFilter extends GenericFilterBean {

   static final String FILTER_APPLIED = "__spring_security_scpf_applied";
   //安全上下文存储的仓库
   private SecurityContextRepository repo;
  
   public SecurityContextPersistenceFilter() {
      //HttpSessionSecurityContextRepository是SecurityContextRepository接口的一个实现类
      //使用HttpSession来存储SecurityContext
      this(new HttpSessionSecurityContextRepository());
   }

   public void doFilter(ServletRequest req, ServletResponse res, FilterChain chain)
         throws IOException, ServletException {
      HttpServletRequest request = (HttpServletRequest) req;
      HttpServletResponse response = (HttpServletResponse) res;

      if (request.getAttribute(FILTER_APPLIED) != null) {
         // ensure that filter is only applied once per request
         chain.doFilter(request, response);
         return;
      }
      request.setAttribute(FILTER_APPLIED, Boolean.TRUE);
      //包装request，response
      HttpRequestResponseHolder holder = new HttpRequestResponseHolder(request,
            response);
      //从Session中获取安全上下文信息
      SecurityContext contextBeforeChainExecution = repo.loadContext(holder);
      try {
         //请求开始时，设置安全上下文信息，这样就避免了用户直接从Session中获取安全上下文信息
         SecurityContextHolder.setContext(contextBeforeChainExecution);
         chain.doFilter(holder.getRequest(), holder.getResponse());
      }
      finally {
         //请求结束后，清空安全上下文信息
         SecurityContext contextAfterChainExecution = SecurityContextHolder
               .getContext();
         SecurityContextHolder.clearContext();
         repo.saveContext(contextAfterChainExecution, holder.getRequest(),
               holder.getResponse());
         request.removeAttribute(FILTER_APPLIED);
         if (debug) {
            logger.debug("SecurityContextHolder now cleared, as request processing completed");
         }
      }
   }

}
```

过滤器一般负责核心的处理流程，而具体的业务实现，通常交给其中聚合的其他实体类，这在Filter的设计中很常见，也同时符合职责分离模式，例如存储安全上下文和读取安全上下文的工作完全委托给了HttpSessionSecurityContextRepository去处理，而这个类中也有几个方法可以稍微解读下，方便我们理解内部的工作流程

`org.springframework.security.web.context.HttpSessionSecurityContextRepository`

```java
public class HttpSessionSecurityContextRepository implements SecurityContextRepository {
   // 'SPRING_SECURITY_CONTEXT'是安全上下文默认存储在Session中的键值
   public static final String SPRING_SECURITY_CONTEXT_KEY = "SPRING_SECURITY_CONTEXT";
   ...
   private final Object contextObject = SecurityContextHolder.createEmptyContext();
   private boolean allowSessionCreation = true;
   private boolean disableUrlRewriting = false;
   private String springSecurityContextKey = SPRING_SECURITY_CONTEXT_KEY;

   private AuthenticationTrustResolver trustResolver = new AuthenticationTrustResolverImpl();

   //从当前request中取出安全上下文，如果session为空，则会返回一个新的安全上下文
   public SecurityContext loadContext(HttpRequestResponseHolder requestResponseHolder) {
      HttpServletRequest request = requestResponseHolder.getRequest();
      HttpServletResponse response = requestResponseHolder.getResponse();
      HttpSession httpSession = request.getSession(false);
      SecurityContext context = readSecurityContextFromSession(httpSession);
      if (context == null) {
         context = generateNewContext();
      }
      ...
      return context;
   }

   ...

   public boolean containsContext(HttpServletRequest request) {
      HttpSession session = request.getSession(false);
      if (session == null) {
         return false;
      }
      return session.getAttribute(springSecurityContextKey) != null;
   }

   private SecurityContext readSecurityContextFromSession(HttpSession httpSession) {
      if (httpSession == null) {
         return null;
      }
      ...
      // Session存在的情况下，尝试获取其中的SecurityContext
      Object contextFromSession = httpSession.getAttribute(springSecurityContextKey);
      if (contextFromSession == null) {
         return null;
      }
      ...
      return (SecurityContext) contextFromSession;
   }

   //初次请求时创建一个新的SecurityContext实例
   protected SecurityContext generateNewContext() {
      return SecurityContextHolder.createEmptyContext();
   }

}
```

SecurityContextPersistenceFilter和HttpSessionSecurityContextRepository配合使用，构成了Spring Security整个调用链路的入口，为什么将它放在最开始的地方也是显而易见的，后续的过滤器中大概率会依赖Session信息和安全上下文信息。

#### 4.3 **UsernamePasswordAuthenticationFilter**  

表单认证是最常用的一个认证方式，一个最直观的业务场景便是允许用户在表单中输入用户名和密码进行登录，而这背后的UsernamePasswordAuthenticationFilter，在整个Spring Security的认证体系中则扮演着至关重要的角色。