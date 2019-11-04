---
title: java trick--system.out.println
date: 2016-11-07 22:03:52
tags: 
- JAVA
categories: 
- JAVA
---

多线程在使用 `system.out.println` 时要留一个有意思的地方
<!-- more -->
```java
public class Main {

    public static void main(String[] args) {
        Thread thread = new MyThread();
        thread.start();
        System.out.println("end");
    }
}

class MyThread extends Thread {

    private int i = 0;

    @Override
    public void run() {
        while (true) {
            i++;
            System.out.println(i);
        }
    }
}
```
主线程另起一个线程，然后在主线程最后打印一个 `end`，猜猜看结果是什么？`end` 会不会打印？
![这里写图片描述](http://img.blog.csdn.net/20161107224558403)
主线程一直被 Mythread 占用
原因就在于 `system.out.println` 是一个同步方法

```java
/**
     * Prints an integer and then terminate the line.  This method behaves as
     * though it invokes <code>{@link #print(int)}</code> and then
     * <code>{@link #println()}</code>.
     *
     * @param x  The <code>int</code> to be printed.
     */
    public void println(int x) {
        synchronized (this) {
            print(x);
            newLine();
        }
    }
```





