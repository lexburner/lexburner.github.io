---
title: Transactional 注解使用注意点
date: 2017-02-14 16:51:52
tags: 
- Spring
- 事务
categories: 
- Spring
toc: true
---

@Transactional 可以说是 spring 中最常用的注解之一了，通常情况下我们在需要对一个 service 方法添加事务时，加上这个注解，如果发生 unchecked exception，就会发生 rollback，最典型的例子如下。

<!-- more -->

```java
@Service
public class StudentService {

    @Autowired
    StudentDao studentDao;

    @Transactional
    public void innerSave(int i) {
        Student student = new Student();
        student.setName("test" + i);
        studentDao.save(student);
        //i=5 会出现异常
        int a = 1 / (i - 5);
    }
}

```

在调用 `innerSave(5)` 时会发运算异常，导致保存操作回滚，不在此赘述了。

新的需求：循环保存 10 个学生，发生异常时要求回滚。

我们理所当然的写出了下面的代码，在 `StudentService.java` 添加如下方法

```
public void outerLooper1() {

  for (int i = 1; i <= 10; i++) {
    try{
    	innerSave(i);
    }catch (Exception e){
    	e.printStackTrace();
    }
  }
}
```

先考虑一下 test5 这个学生有没有保存呢？

结果：

![这里写图片描述](http://img.blog.csdn.net/20170214161532754?watermark/2/text/aHR0cDovL2Jsb2cuY3Nkbi5uZXQvdTAxMzgxNTU0Ng==/font/5a6L5L2T/fontsize/400/fill/I0JBQkFCMA==/dissolve/70/gravity/SouthEast)

依然出现了，考虑下问题出在哪儿了？

其实也好理解，spring 中 @Transactional 的事务开启 ，是基于接口 或者是类的代理被创建的。所以在同一个类中一个普通方法 `outerLooper1()` 调用另一个有事务的方法 `innerSave()`，事务是不会起作用的。要解决这个问题，一般我的做法是写一个帮助类，注入到当前类中，来完成事务操作。

```java
@Autowired
UtilService utilService;

public void outerLooper2() {

	for (int i = 1; i <= 10; i++) {
		utilService.innerSave(i);
	}

}
```

![这里写图片描述](http://img.blog.csdn.net/20170214162943346?watermark/2/text/aHR0cDovL2Jsb2cuY3Nkbi5uZXQvdTAxMzgxNTU0Ng==/font/5a6L5L2T/fontsize/400/fill/I0JBQkFCMA==/dissolve/70/gravity/SouthEast)

在 spring 中使用事务需要遵守一些规范和了解一些坑点，别想当然。列举一下一些注意点。

 - 在需要事务管理的地方加 @Transactional 注解。@Transactional 注解可以被应用于接口定义和接口方法、类定义和类的 public 方法上。

 - `@Transactional` 注解只能应用到 `public` 可见度的方法上。如果你在 `protected`、`private` 或者 `package-visible` 的方法上使用 `@Transactional` 注解，它也不会报错，但是这个被注解的方法将不会展示已配置的事务设置。

 - Spring 团队建议在具体的类（或类的方法）上使用 `@Transactional` 注解，而不要使用在类所要实现的任何接口上。在接口上使用 `@Transactional` 注解，只能当你设置了基于接口的代理时它才生效。因为注解是 不能继承的，这就意味着如果正在使用基于类的代理时，那么事务的设置将不能被基于类的代理所识别，而且对象也将不会被事务代理所包装。

 - `@Transactional` 的事务开启 ，或者是基于接口的或者是基于类的代理被创建。所以在同一个类中一个方法调用另一个方法有事务的方法，事务是不会起作用的。

 - 了解事务的隔离级别，各个数据库默认的隔离级别是不一样的，在 spring 中用的是 isolation =

   Isolation.READ_COMMITTED  来设置；了解事务的传播机制，当发生事务嵌套时，按照业务选择对应的传播机制，用  propagation= Propagation.REQUIRED 来设置。




