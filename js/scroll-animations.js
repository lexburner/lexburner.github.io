/**
 * 滚动渐入动画增强
 * 使用 Intersection Observer API 实现元素进入视口时的动画效果
 */
(function() {
    'use strict';
    
    // 等待 DOM 加载完成
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
    
    function init() {
        // 初始化滚动渐入动画
        initScrollAnimations();
        
        // 初始化图片懒加载和淡入效果
        initImageAnimations();
        
        // 初始化导航栏滚动效果
        initNavbarScroll();
    }
    
    /**
     * 滚动渐入动画
     */
    function initScrollAnimations() {
        // 添加样式到 head
        const style = document.createElement('style');
        style.textContent = `
            .scroll-animate {
                opacity: 0;
                transform: translateY(30px);
                transition: opacity 0.6s ease, transform 0.6s ease;
            }
            
            .scroll-animate.animate-in {
                opacity: 1;
                transform: translateY(0);
            }
            
            .scroll-animate-left {
                opacity: 0;
                transform: translateX(-30px);
                transition: opacity 0.6s ease, transform 0.6s ease;
            }
            
            .scroll-animate-left.animate-in {
                opacity: 1;
                transform: translateX(0);
            }
            
            .scroll-animate-right {
                opacity: 0;
                transform: translateX(30px);
                transition: opacity 0.6s ease, transform 0.6s ease;
            }
            
            .scroll-animate-right.animate-in {
                opacity: 1;
                transform: translateX(0);
            }
            
            .scroll-animate-scale {
                opacity: 0;
                transform: scale(0.9);
                transition: opacity 0.6s ease, transform 0.6s ease;
            }
            
            .scroll-animate-scale.animate-in {
                opacity: 1;
                transform: scale(1);
            }
        `;
        document.head.appendChild(style);
        
        // 为需要动画的元素添加类名
        const animateElements = [
            { selector: '.column-main > .card', className: 'scroll-animate' },
            { selector: '.column-left > .card', className: 'scroll-animate-left' },
            { selector: '.column-right > .card', className: 'scroll-animate-right' },
            { selector: '.widget', className: 'scroll-animate-scale' }
        ];
        
        animateElements.forEach(item => {
            const elements = document.querySelectorAll(item.selector);
            elements.forEach((el, index) => {
                // 避免与现有动画冲突，延迟添加类名
                setTimeout(() => {
                    if (!el.classList.contains('scroll-animate')) {
                        el.classList.add(item.className);
                    }
                }, 100);
            });
        });
        
        // 创建 Intersection Observer
        const observerOptions = {
            root: null,
            rootMargin: '0px',
            threshold: 0.1
        };
        
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('animate-in');
                    // 动画完成后移除观察
                    observer.unobserve(entry.target);
                }
            });
        }, observerOptions);
        
        // 观察所有动画元素
        setTimeout(() => {
            const allAnimateElements = document.querySelectorAll(
                '.scroll-animate, .scroll-animate-left, .scroll-animate-right, .scroll-animate-scale'
            );
            allAnimateElements.forEach(el => observer.observe(el));
        }, 200);
    }
    
    /**
     * 图片懒加载和淡入动画
     */
    function initImageAnimations() {
        const style = document.createElement('style');
        style.textContent = `
            img.lazy-load {
                opacity: 0;
                transition: opacity 0.5s ease;
            }
            
            img.lazy-load.loaded {
                opacity: 1;
            }
            
            .card-image img {
                transition: opacity 0.5s ease, transform 0.5s ease;
            }
        `;
        document.head.appendChild(style);
        
        // 图片懒加载观察器
        if ('IntersectionObserver' in window) {
            const imageObserver = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        const img = entry.target;
                        
                        if (img.dataset.src) {
                            img.src = img.dataset.src;
                            img.removeAttribute('data-src');
                        }
                        
                        img.addEventListener('load', () => {
                            img.classList.add('loaded');
                        });
                        
                        if (img.complete) {
                            img.classList.add('loaded');
                        }
                        
                        imageObserver.unobserve(img);
                    }
                });
            });
            
            // 观察所有图片
            const images = document.querySelectorAll('img');
            images.forEach(img => {
                img.classList.add('lazy-load');
                imageObserver.observe(img);
            });
        } else {
            // 不支持 IntersectionObserver 时直接加载
            const images = document.querySelectorAll('img[data-src]');
            images.forEach(img => {
                img.src = img.dataset.src;
                img.removeAttribute('data-src');
                img.classList.add('loaded');
            });
        }
    }
    
    /**
     * 导航栏滚动背景模糊效果
     */
    function initNavbarScroll() {
        const navbar = document.querySelector('.navbar');
        if (!navbar) return;
        
        let lastScrollTop = 0;
        let ticking = false;
        
        function updateNavbar(scrollTop) {
            if (scrollTop > 100) {
                navbar.style.backgroundColor = 'rgba(255, 255, 255, 0.95)';
                navbar.style.backdropFilter = 'blur(10px)';
                navbar.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.1)';
            } else {
                navbar.style.backgroundColor = '';
                navbar.style.backdropFilter = '';
                navbar.style.boxShadow = '';
            }
            
            lastScrollTop = scrollTop;
            ticking = false;
        }
        
        window.addEventListener('scroll', () => {
            const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
            
            if (!ticking) {
                window.requestAnimationFrame(() => {
                    updateNavbar(scrollTop);
                });
                ticking = true;
            }
        });
    }
    
})();
