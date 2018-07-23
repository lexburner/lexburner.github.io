---
title: java trick -- intergerCache
date: 2016-11-07 23:00:52
tags: 
- JAVA
categories: 
- JAVA
---

看一段代码：

```java
public class Main {
    public static void main(String[] args) {
        Integer a=100,b=100,c=150,d=150;
        System.out.println(a==b);
        System.out.println(c==d);
    }
}
```
这段代码会输出什么？

<!-- more -->

不加留意的人可能会理所当然的认为两个答案会是一致的，但结果却是：

```
true
false
```
下面一个很好解释，因为自动拆装箱机制，比较的是两者的引用，而不是值，所以为false，那么为什么前者是同一个引用呢？

来看看Integer这个类，首先是自动拆装箱会调用`valueOf()`方法

```java
public static Integer valueOf(int i) {
        assert IntegerCache.high >= 127;
        if (i >= IntegerCache.low && i <= IntegerCache.high)
            return IntegerCache.cache[i + (-IntegerCache.low)];
        return new Integer(i);
    }
```
这里并不是简单的返回`new Integer(i)` 而是判断了一下int的数值，Integer的存在一个缓存机制，默认用一个IntegerCache缓存了`[IntegerCache.low,IntegerCache.high]`的引用,其中IntegerCache这个内部类真正在做缓存

```java
private static class IntegerCache {
        static final int low = -128;
        static final int high;
        static final Integer cache[];

        static {
            // high value may be configured by property
            int h = 127;
            String integerCacheHighPropValue =
                sun.misc.VM.getSavedProperty("java.lang.Integer.IntegerCache.high");
            if (integerCacheHighPropValue != null) {
                int i = parseInt(integerCacheHighPropValue);
                i = Math.max(i, 127);
                // Maximum array size is Integer.MAX_VALUE
                h = Math.min(i, Integer.MAX_VALUE - (-low) -1);
            }
            high = h;

            cache = new Integer[(high - low) + 1];
            int j = low;
            for(int k = 0; k < cache.length; k++)
                cache[k] = new Integer(j++);
        }

        private IntegerCache() {}
    }
```
所以就出现了最开始的一个小trick



