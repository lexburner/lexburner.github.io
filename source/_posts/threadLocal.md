---
title:  ThreadLocal的最佳实践
date: 2017-02-14 17:38:52
tags: 
- JAVA
- 多线程
categories: 
- JAVA
---

`SimpleDateFormat`众所周知是线程不安全的，多线程中如何保证线程安全又同时兼顾性能问题呢？那就是使用`ThreadLocal`维护`SimpleDateFormat`

```java
public class SimpleDateFormatThreadTest {

    static volatile AtomicInteger n = new AtomicInteger(-1);

    static ThreadLocal<DateFormat> sdf ;

    static {
        sdf =new ThreadLocal<DateFormat>() {
            @Override
            protected DateFormat initialValue() {
                return new SimpleDateFormat("yyyy-MM-dd");
            }
        };
    }

    public static void main(String[] args) throws ParseException, InterruptedException {

        Set<String> dateSet = new ConcurrentHashSet<>();
        Set<Integer> numberSet = new ConcurrentHashSet<>();

        Date[] dates = new Date[1000];
        for (int i = 0; i < 1000; i++) {
            dates[i] = sdf.get().parse(i + 1000 + "-11-22");
        }

        ExecutorService executorService = Executors.newFixedThreadPool(10);
        for(int i=0;i<1000;i++){
            executorService.execute(new Runnable() {
                @Override
                public void run() {
                    int number = n.incrementAndGet();
                    String date = sdf.get().format(dates[number]);
                    numberSet.add(number);
                    dateSet.add(date);
                    System.out.println(number+" "+date);
                }
            });
        }
        executorService.shutdown();
        Thread.sleep(5000);
        System.out.println(dateSet.size());
        System.out.println(numberSet.size());
    }

}
```

实践证明sdf的parse（String to Date）有严重的线程安全问题，format（Date to String）有轻微的线程安全问题，虽然不太明显，但还是会出现问题，这和内部的实现有关。

简单分析下使用ThreadLocal的好处，1000次转换操作，10个线程争抢执行，如果每次都去new 一个sdf，可见其效率之低，而使用ThreadLocal，是对每个线程维护一个sdf，所以最多就只会出现10个sdf，真正项目中，由于操作系统线程分片执行，所以线程不会非常的多，使用ThreadLocal的好处也就立竿见影了。