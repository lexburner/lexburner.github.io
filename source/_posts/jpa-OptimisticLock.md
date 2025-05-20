---
title: 使用 JPA 实现乐观锁
date: 2016-08-16 15:52:52
tags: 
- 多线程
- 数据库
categories: 
- JAVA
toc: true
---



乐观锁的概念就不再赘述了，不了解的朋友请自行百度谷歌之，今天主要说的是在项目中如何使用乐观锁，做成一个小 demo。

持久层使用 jpa 时，默认提供了一个注解 `@Version` 先看看源码怎么描述这个注解的

```java
@Target({METHOD, FIELD})
@Retention(RUNTIME)
public @interface Version {
}
```
简单来说就是用一个 version 字段来充当乐观锁的作用。
先来设计实体类

```java
/**
 * Created by xujingfeng on 2017/1/30.
 */
@Entity
@Table(name = "t_student")
public class Student {

    @Id
    @GenericGenerator(name = "PKUUID", strategy = "uuid2")
    @GeneratedValue(generator = "PKUUID")
    @Column(length = 36)
    private String id;

    @Version
    private int version;

    private String name;

    //getter()...
    //setter()...
}
```
<!-- more -->

Dao 层

```java
/**
 * Created by xujingfeng on 2017/1/30.
 */
public interface StudentDao extends JpaRepository<Student,String>{

    @Query("update Student set name=?1 where id=?2")
    @Modifying
    @Transactional
    int updateNameById(String name,String id);
}
```
Controller 层充当单元测试的作用，通过访问一个 requestMapping 来触发我们想要测试的方法。

```java
/**
 * Created by xujingfeng on 2017/1/30.
 */
@Controller
public class StudentController {

    @Autowired
    StudentDao studentDao;

    @RequestMapping("student.html")
    @ResponseBody
    public String student(){
        Student student = new Student();
        student.setName("xujingfeng");
        studentDao.save(student);
        return "student";
    }

    @RequestMapping("testVersion.html")
    @ResponseBody
    public String testVersion() throws InterruptedException {
        Student student = studentDao.findOne("6ed16acc-61df-4a66-add9-d17c88b69755");
        student.setName("xuxuan");
        new Thread(new Runnable() {
            @Override
            public void run() {
                studentDao.findOne("6ed16acc-61df-4a66-add9-d17c88b69755");
                student.setName("xuxuanInThread");
                studentDao.save(student);
            }
        }).start();
        Thread.sleep(1000);
        studentDao.save(student);
        return "testVersion";
    }


    @RequestMapping("updateNameById.html")
    @ResponseBody
    public String updateNameById(){
        studentDao.updateNameById("xuxuan2","6ed16acc-61df-4a66-add9-d17c88b69755");
        return "updateNameById";
    }


}
```
这里面三个方法，主要是我们想用来测试的三个注意点。
第一个方法 `student.html` 我们想看看 springdata 如何对 version 字段进行增长的。就不贴图了，直接给结论，对于添加了 `@Version` 的注解，我们不需要手动去控制，每一次 save 操作会在原来的基础上 +1，如果初始为 null，则 springdata 自动设置其为 0。
第二个方法 `testVersion.html` 是乐观锁的核心，当多个线程并发访问同一行记录时，添加了 `@Version` 乐观锁之后，程序会进行怎么样的控制呢？

```
org.hibernate.StaleObjectStateException: Row was updated or deleted by another transaction (or unsaved-value mapping was incorrect) : [com.example.jpa.Student#6ed16acc-61df-4a66-add9-d17c88b69755]
```
异常信息如上，主线程和新线程获取了同一行记录，并且新线程优先提交了事务，版本号一致，修改成功。等到了主线程再想 save 提交事务时，便得到一个版本号不一致的异常，那么在项目开发中就应该自己捕获这个异常根据业务内容做对应处理，是重试还是放弃 etc...

第三个方法，`updateNameById.html` 是想强调一下，`@Query` 中的 `update`，`delete` 操作是不会触发 springdata 的相关代理操作的，而是转化为原生 sql 的方式，所以在项目中使用时也要注意这点。

总结
--
乐观锁，用在一些敏感业务数据上，而其本身的修饰：乐观，代表的含义便是相信大多数场景下 version 是一致的。但是从业务角度出发又要保证数据的严格一致性，避免脏读等问题，使用的场景需要斟酌。记得前面一片博文简单介绍了一下行级锁的概念，其实本质上和乐观锁都是想要再数据库层面加锁控制并发，那么什么时候该用乐观锁，行级锁，什么时候得在程序级别加同步锁，又要根据具体的业务场景去判断。找到能够满足自己项目需求的方案，找到性能和可靠性的平衡点，才是一个程序员的价值所在。

