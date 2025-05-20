---
title: 海量无序数据寻找第 K 大的数
toc: true
type: 1
date: 2021-06-29 21:23:39
category:
- 性能挑战赛
tags:
- topk
---

## 前言

最近在参加阿里云举办的《第三届数据库大赛创新上云性能挑战赛--高性能分析型查询引擎赛道》，传送门：https://tianchi.aliyun.com/competition/entrance/531895/introduction

好久没有打比赛了，也是突然来了兴致，参加性能挑战赛总有一种自己还年轻的感觉。因为比赛还没有结束，所以赛题解析还不方便这时候就写出来，但是其中一个优化点，倒是可以拿出来跟大家分享下。

简单抽象一下问题，便是今天的主题：在一个百万级无序的 long 数组中，寻找第 K 大的数值。要求当然是越快找到越好。

<!-- more -->

## top K 问题

题面一描述出来，很多人都会联想到 top K 问题，这道题无论是算法领域还是工程领域，都讨论的极其广泛，并且在实际项目中也很容易会遇到类似的问题，我也正好趁着这个机会总结成一篇文章。

常见的 top K 问题，及其变种：

1. 有 10000000 个记录，这些查询串的重复度比较高，如果除去重复后，不超过 3000000 个。一个查询串的重复度越高，说明查询它的用户越多，也就是越热门。请统计最热门的 10 个查询串，要求使用的内存不能超过 1GB。

2. 有 10 个文件，每个文件 1GB，每个文件的每一行存放的都是用户的 query，每个文件的 query 都可能重复。按照 query 的频度排序。

3. 有一个 1GB 大小的文件，里面的每一行是一个词，词的大小不超过 16 个字节，内存限制大小是 1MB。返回频数最高的 100 个词。
4. 提取某日访问网站次数最多的那个 IP。
5. 10 亿个整数找出重复次数最多的 100 个整数。
6. 搜索的输入信息是一个字符串，统计 300 万条输入信息中最热门的前 10 条，每次输入的一个字符串为不超过 255B，内存使用只有 1GB。
7. 有 1000 万个身份证号以及他们对应的数据，身份证号可能重复，找出出现次数最多的身份证号。

这些问题：

传统 top K 问题的描述：

> 在海量数据中找出最大的前 K 个数，这类问题通常被称为 top K 问题。例如，在搜索引擎中，统计搜索最热门的 10 个查询词；在歌曲库中统计下载最高的前 10 首歌等。

注意我这次提出的问题和传统 top K 有一点区别，传统的 top K 问题要求的一般是”前 K 大的数“，而我现在遇到的是”第 K 大的数“。区别要说大也不大，但对于我们最终选择的方案可能会有很大的区别。

我下面会介绍一些传统的 top K 问题的解决思路，并且各个方案我也会穿插对比 top K 个数和第 K 大的数的适用区别。并且，按照我一贯的风格，肯定会有代码放出来，你如果是为了寻找一个”海量无序数据寻找第 K 大的数“问题的答案，相信你可以直接 copy 我的代码。

## 方案一：排序法

排序法是最容易想到的思路，复杂度为 O(nlogn) 。能够想到的各类排序算法呼之欲出，快速排序、归并排序、插入排序、猴子排序...etc

但是工程领域选择方案，往往不能仅仅使用算法复杂度来评估：

- 每个排序方案数据的交换量
- 额外空间的申请量
- 平均复杂度
- 最坏复杂度
- 不同数据量下的表现

那这个时候有人就要问了，我该如何选择合适的方案呢？哎，那我又要提到那句话了，benchmark everything！虽然你肯定知道我最终没有选择使用排序来解决第 K 大的问题，但我还是想分享给你我的一些测试结论。

在 100w~1000w 数据量级别的无序 long 数组中，JDK 自带的 Array.sort() 比任何一个排序方案都要快。

> Array.sort 的内部实现为 timsort，是一种优化过后的归并排序。

排序单纯靠想也知道不是最优的方案，因为我提出的问题中，仅仅需要找到第 K 大的数，排序方案却兴师动众把整个数组理顺了，没必要。

## 方案二：堆

针对一般的 top K 问题，一般都会默认 K 很小，所以一般的 top K 问题，可以选择使用堆来解决。

堆有个重要的性质：每个结点的值均不大于其左右孩子结点的值，则堆顶元素即为整个堆的最小值。JDK 中 `PriorityQueue` 实现了堆这个数据结构堆，通过指定 `comparator` 字段来表示小顶堆或大顶堆，默认为自然序（natural ordering）。

小顶堆解决 Top K 问题的思路：小顶堆维护当前扫描到的最大 K 个数，其后每一次扫描到的元素，若大于堆顶则入堆，然后删除堆顶；依此往复，直至扫描完所有元素。Java 实现第 K 大整数代码如下：

```
public int findKthLargest(int[] nums, int k) {
  PriorityQueue<Integer> minQueue = new PriorityQueue<>(k);
  for (int num : nums) {
    if (minQueue.size() < k || num > minQueue.peek())
      minQueue.offer(num);
    if (minQueue.size() > k)
      minQueue.poll();
  }
  return minQueue.peek();
}
```

回到我遇到的问题，求第 K 大的数，这里没有说明 K 的范围，那么最坏情况下，K == N/2，无论维护一个 top K 的小顶堆还是维护一个 top(N - K) 的大顶堆，都需要占用 O(N/2) 的内存，而对于海量数据而言，这显示是一笔非常大的开销。所以针对我比赛的场景，堆的方案可以直接 pass。

堆的解法适用于 K 较小的场景，而且非常方便维护前 K 个数。

## 方案三：Quick Select

Quick Select 你可能没听过，但快速排序（Quick Sort）你肯定有所耳闻，其实他们两个算法的作者都是 Hoare，并且思想也非常接近：选取一个基准元素 pivot，将数组切分（partition）为两个子数组，比 pivot 大的扔左子数组，比 pivot 小的扔右子数组，然后递推地切分子数组。Quick Select 不同于 Quick Sort 之处在于其没有对每个子数组做切分，而是对目标子数组做切分。其次，Quick Select 与Quick Sort 一样，是一个不稳定的算法；pivot 选取直接影响了算法的好坏，最坏情况下的时间复杂度达到了 O(n2)。

在大学参加 ACM 时，我便第一次接触了该算法，记得那时数据量正好卡的 Quick Sort 无法通过，Quick Select 可以通过。

Quick Select 的 Java 实现如下：

```java
public static long quickSelect(long[] nums, int start, int end, int k) {
        if (start == end) {
            return nums[start];
        }
        int left = start;
        int right = end;
        long pivot = nums[(start + end) / 2];
        while (left <= right) {
            while (left <= right && nums[left] > pivot) {
                left++;
            }
            while (left <= right && nums[right] < pivot) {
                right--;
            }
            if (left <= right) {
                long temp = nums[left];
                nums[left] = nums[right];
                nums[right] = temp;
                left++;
                right--;
            }
        }
        if (start + k - 1 <= right) {
            return quickSelect(nums, start, right, k);
        }
        if (start + k - 1 >= left) {
            return quickSelect(nums, left, end, k - (left - start));
        }
        return nums[right + 1];
    }
```

最终，我选择使用了方案三：Quick Select 作为我求解第 K 大数的方案，也是 benchmark 下来最快的方案。在 10 次查询中，排序方案耗时为 6s，而 Quick Select 方案，仅需要 300ms，可以说是非常大的优化。

## 总结

本文简单介绍了无序数组求 Top K 问题和无序数组求第 K 大数字两类非常相似的问题，并且提供了常见的三种解决方案。当然，该问题也有很多变种，例如在多核机器，多主机上求解 TopK，甚至可以引入外排和 MapReduce 的思想，其实已经是在考虑其他层面的优化了，我在这里就不过多阐释了。

