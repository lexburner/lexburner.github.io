---
title: spring 中的懒加载与事务 -- 排坑记录
date: 2017-06-23 13:37:41
tags: 
- Spring
- 事务
categories: 
- Spring
toc: true
---



## 案例描述
本文主要描述了开发中常见的几个与 spring 懒加载和事务相关的案例，描述常见的使用场景，以及如何规避他们，给出具体的代码。
1. 在新的线程中，访问某个持久化对象的懒加载属性。
2. 在 quartz 定时任务中，访问某个持久化对象的懒加载属性。
3. 在 dubbo，motan 一类 rpc 框架中，远程调用时服务端 session 关闭的问题。

上面三个案例，其实核心都是一个问题，就是牵扯到 spring 对事务的管理，而懒加载这个技术，只是比较容易体现出事务出错的一个实践，主要用它来引发问题，进而对问题进行思考。

<!-- more -->

## 前期准备
为了能直观的暴露出第一个案例的问题，我新建了一个项目，采用传统的 mvc 分层，一个 student.java 实体类，一个 studentDao.java 持久层，一个 studentService.java 业务层，一个 studentController 控制层。

```java
@Entity
@Table(name = "student")
public class Student {
	@Id
	@GeneratedValue(strategy = GenerationType.AUTO)
	private Integer id;
	private String name;
	
	getter..setter..
}
```
持久层使用 springdata，框架自动扩展出 CURD 方法
```java
public interface StudentDao extends JpaRepository<Student, Integer>{
}
```
service 层，先给出普通的调用方法。用于错误演示。
```java
@Service
public class StudentService {

    @Autowired
    StudentDao studentDao;

    public void testNormalGetOne(){
        Student student = studentDao.getOne(1);
        System.out.println(student.getName());
    }
}
```
注意：getOne 和 findOne 都是 springdata 提供的根据 id 查找单个实体的方法，区别是前者是懒加载，后者是立即加载。我们使用 getOne 来进行懒加载的实验，就不用大费周章去写懒加载属性，设置多个实体类了。

controller 层，不是简简单单的调用，而是在新的线程中调用。使用 controller 层来代替单元测试（实际项目中，通常使用 controller 调用 service，然后在浏览器或者 http 工具中调用触发，较为方便）
```java
	@RequestMapping("/testNormalGetOne")
	@ResponseBody
	public String testNormalGetOne() {
		new Thread(new Runnable() {
			@Override
			public void run() {
				studentService.testNormalGetOne();
			}
		}).start();
		return "testNormalGetOne";
	}
```
启动项目后，访问 `localhost:8080/testNormalGetOne` 报错如下：
```java
Exception in thread "Thread-6" org.hibernate.LazyInitializationException: could not initialize proxy - no Session
```

## 问题分析
no session 说明了什么？
道理很简单，因为 spring 的 session 是和线程绑定的，在整个 model->dao->service->controller 的调用链中，这种事务和线程绑定的机制非常契合。而我们出现的问题正式由于新开启了一个线程，这个线程与调用链的线程不是同一个。

## 问题解决
我们先使用一种不太优雅的方式解决这个问题。在新的线程中，手动打开 session。

```java
public void testNormalGetOne() {
        EntityManagerFactory entityManagerFactory = ApplicationContextProvider.getApplicationContext().getBean(EntityManagerFactory.class);
        EntityManager entityManager = entityManagerFactory.createEntityManager();
        EntityManagerHolder entityManagerHolder = new EntityManagerHolder(entityManager);
        TransactionSynchronizationManager.bindResource(entityManagerFactory, entityManagerHolder);
        Student student = studentDao.getOne(1);
        System.out.println(student.getName());
        TransactionSynchronizationManager.unbindResource(entityManagerFactory);
        EntityManagerFactoryUtils.closeEntityManager(entityManager);
}
```
由于我们使用了 JPA，所以事务是由 EntityManagerFactory 这个工厂类生成的 EntityManager 来管理的。`TransactionSynchronizationManager.bindResource(entityManagerFactory, entityManagerHolder);` 这个方法使用事务管理器绑定 session。
而 `ApplicationContextProvider` 这个工具类是用来获取 spring 容器中的 `EntityManagerFactory` 的，为什么不用注入的方式，下文讲解。它的代码如下：
```java
public class ApplicationContextProvider implements ApplicationContextAware {

    private static ApplicationContext context = null;

    public static ApplicationContext getApplicationContext() {
        return context;
    }

    @Override
    public void setApplicationContext(ApplicationContext ac) throws BeansException {
        context = ac;
    }
}
```
问题暂时得到了解决。

## 问题再思考
我们一般情况下使用懒加载属性，为什么没有出现 no session 的问题呢？相信大家都知道 `@Transactional` 这个注解，他会帮我们进行事务包裹，当然也会绑定 session；以及大家熟知的 hiberbate 中的 `OpenSessionInterceptor` 和 `OpenSessionInViewFilter` 以及 jpa 中的 ` OpenEntityManagerInViewInterceptor` 都是在没有 session 的情况下，打开 session 的过滤器。这种方法开始前依赖事务开启，方法结束后回收资源的操作，非常适合用过滤器拦截器处理，后续的两个未讲解的案例，其实都是使用了特殊的过滤器。

看一下官方文档如何描述这个 jpa 中的过滤器的：

> 29.3.4 Open EntityManager in View

>If you are running a web application, Spring Boot will by default register OpenEntityManagerInViewInterceptor to apply the "Open EntityManager in View" pattern, i.e. to allow for lazy loading in web views. If you don’t want this behavior you should set spring.jpa.open-in-view to false in your application.properties.

我们尝试着关闭这个过滤器：
配置 application.properties/application.yml 文件
```properties
spring.jpa.open-in-view=false
```
再使用正常的方式访问懒加载属性（而不是在一个新的线程中）：

```java
	@RequestMapping("/testNormalGetOne")
	@ResponseBody
	public String testNormalGetOne() {
//		new Thread(new Runnable() {
//			@Override
//			public void run() {
				studentService.testNormalGetOne();
//			}
//		}).start();
		return "testNormalGetOne";
	}
```
报错如下：

```json
{"timestamp":1498194914012,"status":500,"error":"Internal Server Error","exception":"org.hibernate.LazyInitializationException","message":"could not initialize proxy - no Session","path":"/testNormalGetOne"}
```
是的，我们使用 spring 的 controller 作为单元测试时，以及我们平时在直接使用 jpa 的懒加载属性时没有太关注这个 jpa 的特性，因为 springboot 帮我们默认开启了这个过滤器。这也解释了，为什么在新的线程中，定时任务线程中，rpc 远程调用时 session 没有打开的原因，因为这些流程没有经过 springboot 的 web 调用链。

## 另外两个实战案例
上文已经阐释了，为什么 quartz 定时任务中访问懒加载属性，rpc 框架服务端访问懒加载属性（注意不是客户端，客户端访问懒加载属性那是一种作死的行为，因为是代理对象）为出现问题。我们仿照 spring 打开 session 的思路（这取决于你使用 hibernate 还是 jpa，抑或是 mybatis），来编写我们的过滤器。

**quartz 中打开 session：**
使用 quartz 提供的 `JobListenerSupport` 支持，编写一个任务过滤器，用于在每次任务执行时打开 session
```java
public class OpenEntityManagerJobListener extends JobListenerSupport implements ApplicationContextAware {

    @Override
    public String getName() {
        return "OpenEntityManagerJobListener";
    }

    EntityManagerFactory entityManagerFactory;

    @Override
    public void jobToBeExecuted(JobExecutionContext context) {
        entityManagerFactory = applicationContext.getBean(EntityManagerFactory.class);
        EntityManager entityManager = entityManagerFactory.createEntityManager();
        EntityManagerHolder emHolder = new EntityManagerHolder(entityManager);
        TransactionSynchronizationManager.bindResource(entityManagerFactory, emHolder);
    }

    @Override
    public void jobWasExecuted(JobExecutionContext context, JobExecutionException jobException) {
        EntityManagerHolder emHolder = (EntityManagerHolder) TransactionSynchronizationManager.unbindResource(entityManagerFactory);
        EntityManagerFactoryUtils.closeEntityManager(emHolder.getEntityManager());
    }


    ApplicationContext applicationContext;

    @Override
    public void setApplicationContext(ApplicationContext applicationContext) throws BeansException {
        this.applicationContext = applicationContext;
        if(this.applicationContext ==null) throw new RuntimeException("applicationContext is null");
    }
}
```
** 配置调度工厂：**

```java
// 调度工厂
    @Bean
    public SchedulerFactoryBean schedulerFactoryBean() {
        SchedulerFactoryBean factoryBean = new SchedulerFactoryBean();
        factoryBean.setTriggers(triggerFactoryBeans().getObject());
        factoryBean.setGlobalJobListeners(openEntityManagerJobListener());
        return factoryBean;
    }
```

也可以参考我的另一篇描述更为细致的文章 (解决 Quartz 定时器中查询懒加载数据 no session 的问题)，那是我还是刚刚参加工作，可能有些许疏漏之处，不过参考是够了。

**Motan（我现在使用的 rpc 框架）服务端打开 session**
利用了 motan 对 spi 扩展的支持，编写了一个 Filter，主要参考了 motan 的 spi 过滤器写法和 springdata 打开 session/entityManager 的思路。
```java
@SpiMeta(name = "openjpasession")
@Activation(sequence = 100)
public class OpenEntityManagerInMotanFilter implements Filter {
    private Logger logger = LoggerFactory.getLogger(OpenEntityManagerInMotanFilter.class);

    /**
     * Default EntityManagerFactory bean name: "entityManagerFactory".
     * Only applies when no "persistenceUnitName" param has been specified.
     *
     * @see #setEntityManagerFactoryBeanName
     * @see #setPersistenceUnitName
     */
    public static final String DEFAULT_ENTITY_MANAGER_FACTORY_BEAN_NAME = "entityManagerFactory";


    private String entityManagerFactoryBeanName;

    private String persistenceUnitName;

    private volatile EntityManagerFactory entityManagerFactory;


    /**
     * Set the bean name of the EntityManagerFactory to fetch from Spring's
     * root application context.
     * <p>Default is "entityManagerFactory". Note that this default only applies
     * when no "persistenceUnitName" param has been specified.
     *
     * @see #setPersistenceUnitName
     * @see #DEFAULT_ENTITY_MANAGER_FACTORY_BEAN_NAME
     */
    public void setEntityManagerFactoryBeanName(String entityManagerFactoryBeanName) {
        this.entityManagerFactoryBeanName = entityManagerFactoryBeanName;
    }

    /**
     * Return the bean name of the EntityManagerFactory to fetch from Spring's
     * root application context.
     */
    protected String getEntityManagerFactoryBeanName() {
        return this.entityManagerFactoryBeanName;
    }

    /**
     * Set the name of the persistence unit to access the EntityManagerFactory for.
     * <p>This is an alternative to specifying the EntityManagerFactory by bean name,
     * resolving it by its persistence unit name instead. If no bean name and no persistence
     * unit name have been specified, we'll check whether a bean exists for the default
     * bean name "entityManagerFactory"; if not, a default EntityManagerFactory will
     * be retrieved through finding a single unique bean of type EntityManagerFactory.
     *
     * @see #setEntityManagerFactoryBeanName
     * @see #DEFAULT_ENTITY_MANAGER_FACTORY_BEAN_NAME
     */
    public void setPersistenceUnitName(String persistenceUnitName) {
        this.persistenceUnitName = persistenceUnitName;
    }

    /**
     * Return the name of the persistence unit to access the EntityManagerFactory for, if any.
     */
    protected String getPersistenceUnitName() {
        return this.persistenceUnitName;
    }

    /**
     * Look up the EntityManagerFactory that this filter should use.
     * <p>The default implementation looks for a bean with the specified name
     * in Spring's root application context.
     *
     * @return the EntityManagerFactory to use
     * @see #getEntityManagerFactoryBeanName
     */
    protected EntityManagerFactory lookupEntityManagerFactory() {

        String emfBeanName = getEntityManagerFactoryBeanName();
        String puName = getPersistenceUnitName();
        if (StringUtils.hasLength(emfBeanName)) {
            return ApplicationContextProvider.getApplicationContext().getBean(emfBeanName, EntityManagerFactory.class);
        } else if (!StringUtils.hasLength(puName) && ApplicationContextProvider.getApplicationContext().containsBean(DEFAULT_ENTITY_MANAGER_FACTORY_BEAN_NAME)) {
            return ApplicationContextProvider.getApplicationContext().getBean(DEFAULT_ENTITY_MANAGER_FACTORY_BEAN_NAME, EntityManagerFactory.class);
        } else {
            // Includes fallback search for single EntityManagerFactory bean by type.
            return EntityManagerFactoryUtils.findEntityManagerFactory(ApplicationContextProvider.getApplicationContext(), puName);
        }
    }

    /**
     * Create a JPA EntityManager to be bound to a request.
     * <p>Can be overridden in subclasses.
     *
     * @param emf the EntityManagerFactory to use
     * @see javax.persistence.EntityManagerFactory#createEntityManager()
     */
    protected EntityManager createEntityManager(EntityManagerFactory emf) {
        return emf.createEntityManager();
    }

    @Override
    public Response filter(Caller<?> caller, Request request) {
        if (!(caller instanceof Provider)) {
            return caller.call(request);
        }

        EntityManagerFactory emf = null;
        try {
            emf = lookupEntityManagerFactory();
        } catch (Exception e) {
            logger.error(e.getMessage(), e);
        }

        // 可能没有启用 openjpa
        if (emf == null) {
            return caller.call(request);
        }

        try {
            // 如果没有绑定，绑定到当前线程
            if (TransactionSynchronizationManager.getResource(emf) == null) {
                EntityManager em = createEntityManager(emf);
                EntityManagerHolder emHolder = new EntityManagerHolder(em);
                TransactionSynchronizationManager.bindResource(emf, emHolder);
            }
        } catch (Exception e) {
            logger.error(e.getLocalizedMessage(), e);
        }
        try {
            return caller.call(request);
        } finally {
            // 解除绑定
            closeManager(emf);
        }
    }

    /**
     * 关闭 emf
     *
     * @param emf
     */
    private void closeManager(EntityManagerFactory emf) {
        if (emf == null || TransactionSynchronizationManager.getResource(emf) == null) {
            return;
        }
        EntityManagerHolder emHolder = null;
        try {
            emHolder = (EntityManagerHolder) TransactionSynchronizationManager.unbindResource(emf);
        } catch (IllegalStateException e) {
            logger.error(e.getLocalizedMessage(), e);
        }
        try {
            if (emHolder != null) {
                EntityManagerFactoryUtils.closeEntityManager(emHolder.getEntityManager());
            }
        } catch (Exception e) {
            logger.error(e.getLocalizedMessage(), e);
        }
    }
}
```

## 总结
springboot 中的事务管理做的永远比我们想的多，事务管理器的使用场景，@Transactional 究竟起了哪些作用，以及 spring-data 这个对 DDD 最佳的阐释，以及 mybatis 一类的非 j2ee 规范在微服务的地位中是否高于 jpa，各个层次之间的实体传输，消息传递... 都是值得思考的。

