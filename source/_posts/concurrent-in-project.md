---
title: 浅析项目中的并发
date: 2017-02-22 11:31:52
tags: 
- 多线程
- JAVA
categories: 
- 架构设计
---



前言
--

控制并发的方法很多，我之前的两篇博客都有过介绍，从最基础的 synchronized，juc 中的 lock，到数据库的行级锁，乐观锁，悲观锁，再到中间件级别的 redis，zookeeper 分布式锁。今天主要想讲的主题是“根据并发出现的具体业务场景，使用合理的控制并发手段”。

什么是并发
-----
由一个大家都了解的例子引入我们今天的主题：并发

```java
public class Demo1 {

    public Integer count = 0;

    public static void main(String[] args) {
        final Demo1 demo1 = new Demo1();
        Executor executor = Executors.newFixedThreadPool(10);
        for(int i=0;i<1000;i++){
            executor.execute(new Runnable() {
                @Override
                public void run() {
                    demo1.count++;
                }
            });
        }
        try {
            Thread.sleep(5000);
        } catch (InterruptedException e) {
            e.printStackTrace();
        }

        System.out.println("final count value:"+demo1.count);
    }
}

console:
final count value:973
```
这个过程中，类变量 count 就是共享资源，而 ++ 操作并不是线程安全的，而多个线程去对 count 执行 ++ 操作，并没有 happens-before 原则保障执行的先后顺序，导致了最终结果并不是想要的 1000

<!-- more -->

下面，我们把并发中的共享资源从类变量转移到数据库中。
先来看看使用框架的情况，以 JPA 为例（充血模型）

```java
@Component
public class Demo2 {

    @Autowired
    TestNumDao testNumDao;

    @Transactional
    public void test(){
        TestNum testNum = testNumDao.findOne("1");
        testNum.setCount(testNum.getCount()+1);
        testNumDao.save(testNum);
    }

}
controller:
	@Autowired
    Demo2 demo2;

    @RequestMapping("test")
    @ResponseBody
    public String test(){
        Executor executor = Executors.newFixedThreadPool(10);
        for(int i=0;i<1000;i++){
            executor.execute(new Runnable() {
                @Override
                public void run() {
                    demo2.test();
                }
            });
        }
        return "test";
    }
```
数据库的记录

| id   | count |
| ---- | ----- |
| 1    | 344   |

初窥门径的程序员会认为事务最基本的 ACID 中便包含了原子性，但是事务的原子性和今天所讲的并发中的原子操作仅仅是名词上有点类似。而有点经验的程序员都能知道这中间发生了什么（下面细说），这只是暴露了项目中并发问题的冰山一角。

改成直接用 sql 如何呢（贫血模型）？

```java
@RequestMapping("testSql")
    @ResponseBody
    public String testSql() throws InterruptedException {
        final CountDownLatch countDownLatch = new CountDownLatch(1000);
        long start = System.currentTimeMillis();
        Executor executor = Executors.newFixedThreadPool(10);
        for(int i=0;i<1000;i++){
            executor.execute(new Runnable() {
                @Override
                public void run() {
                    jdbcTemplate.execute("update test_num set count = count + 1 where id ='1'");
                    countDownLatch.countDown();
                }
            });
        }
        countDownLatch.await();
        long costTime =System.currentTimeMillis() - start;
        System.out.println("共花费："+costTime+"s");
        return "testSql";
    }
```
数据库结果： count ： 1000 达到了预期效果
这个例子我顺便记录了耗时, 控制台打印: 共花费：113 ms
简单对比一下二，三两个例子，都是想对数据库的 count 进行 +1 操作，唯一的区别就是，后者的 +1 计算发生在数据库，而前者的计算依赖于事先查出来的值，并且计算发生在程序的内存中。而现在大部分的 ORM 框架的兴起，导致了写第二种代码的程序员变多，不注意并发的话，就会出现问题。下面我们来看看具体的业务场景。

业务场景
----

  1.  修改个人信息
  2.  修改商品信息
  3.  扣除账户余额，扣减库存


业务场景分析
------
第一个场景，互联网如此众多的用户修改个人信息，这算不算并发？答案是：算也不算。
算，从程序员角度来看，每一个用户请求进来，都是调用的同一个修改入口，具体一点，就是映射到 controller 层的同一个 requestMapping，所以一定是并发的。
不算，虽然程序是并发的，但是从用户角度来分析，每个人只可以修改自己的信息，所以，不同用户的操作其实是隔离的，所以不算“并发”。这也是为什么很多开发者，在日常开发中一直不注意并发控制，却也没有发生太大问题的原因，大多数初级程序员开发的还都是 CRM，OA，CMS 系统。

回到我们的并发，第一种业务场景，是可以使用如上模式的，对于一条用户数据的修改，我们允许程序员读取数据到内存中，内存计算修改（耗时操作），提交更改，提交事务。

```java
//Transaction start
User user = userDao.findById("1");
user.setName("newName");
user.setAge(user.getAge()+1);
...// 其他耗时操作
userDao.save(user);
//Transaction commit
```

这个场景变现为：几乎不存在并发，不需要控制，场景乐观。

为了严谨，也可以选择控制并发，但我觉得这需要交给写这段代码的同事，让他自由发挥。第二个场景已经有所不同了，同样是修改一个记录，但是系统中可能有多个操作员来维护，此时，商品数据表现为一个共享数据，所以存在微弱的并发，通常表现为数据的脏读，例如操作员 A，B 同时对一个商品信息维护，我们希望只能有一个操作员修改成功，另外一个操作员得到错误提示（该商品信息已经发生变化），否则，两个人都以为自己修改成功了，但是其实只有一个人完成了操作，另一个人的操作被覆盖了。

这个场景表现为：存在并发，需要控制，允许失败，场景乐观。

通常我建议这种场景使用乐观锁，即在商品属性添加一个 `version` 字段标记修改的版本，这样两个操作员拿到同一个版本号，第一个操作员修改成功后版本号变化，另一个操作员的修改就会失败了。

```java
class Goods{
	@Version
	int version;
}

//Transaction start
try{
	Goods goods = goodsDao.findById("1");
	goods.setName("newName");
	goods.setPrice(goods.getPrice()+100.00);
	...// 其他耗时操作
	goodsDao.save(goods);
}catch(org.hibernate.StaleObjectStateException e){
	// 返回给前台
}

//Transaction commit
```
springdata 配合 jpa 可以自动捕获 version 异常，也可以自动手动对比。

第三个场景
这个场景表现为：存在频繁的并发，需要控制，不允许失败，场景悲观。

** 强调一下，本例不应该使用在项目中，只是为了举例而设置的一个场景，因为这种贫血模型无法满足复杂的业务场景，而且依靠单机事务来保证一致性，并发性能和可扩展性能不好。**

一个秒杀场景，大量请求在短时间涌入，是不可能像第二种场景一样，100 个并发请求，一个成功，其他 99 个全部异常的。

设计方案应该达到的效果是：有足够库存时，允许并发，库存到 0 时，之后的请求全部失败；有足够金额时，允许并发，金额不够支付时立刻告知余额不足。

可以利用数据库的行级锁，
`update set balance = balance - money where userId = ? and balance >= money;` 
`update stock = stock - number where goodsId = ? and stock >= number ;`  然后在后台 查看返回值是否影响行数为 1，判断请求是否成功，利用数据库保证并发。

需要补充一点，我这里所讲的秒杀，并不是指双 11 那种级别的秒杀，那需要多层架构去控制并发，前端拦截，负载均衡.... 不能仅仅依赖于数据库的，会导致严重的性能问题。为了留一下一个直观的感受，这里对比一下 oracle，mysql 的两个主流存储引擎：innodb，myisam 的性能问题。
```
oracle:
10000 个线程共计 1000000 次并发请求：共花费：101017 ms =>101s
innodb:
10000 个线程共计 1000000 次并发请求：共花费：550330 ms =>550s
myisam:
10000 个线程共计 1000000 次并发请求：共花费：75802 ms =>75s
```
可见，如果真正有大量请求到达数据库，光是依靠数据库解决并发是不现实的，所以仅仅只用数据库来做保障而不是完全依赖。需要根据业务场景选择合适的控制并发手段。

后续，待补充
--
分布式锁控制并发...
浅析队列在并发场景中的地位...



